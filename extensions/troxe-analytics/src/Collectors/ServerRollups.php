<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use DateInterval;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\ServerSeries;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Support\Cursor;
use TroxeAnalytics\Support\Pressure;

/**
 * Turns minute samples into hour rows, and hour rows into day rows.
 *
 * Days are rolled from hours and never from samples, so a year of history costs the same
 * to read as a day does. Work is bounded two ways: a row budget that shrinks when the host
 * is busy, and a wall-clock deadline after which the pass stops and leaves its cursor where
 * it got to. Nothing is skipped, only deferred to the next run.
 */
final class ServerRollups
{
    /** Hours a single pass may catch up, so a first run or a long outage cannot run away. */
    private const int MAX_HOURS_PER_PASS = 48;

    private const int MAX_DAYS_PER_PASS = 7;

    /** @var list<string> */
    private const array UPDATE = [
        'node_id', 'samples', 'running_samples', 'restarts',
        'cpu_avg', 'cpu_max', 'cpu_std',
        'memory_avg', 'memory_max', 'memory_std', 'disk_max',
        'rx_bytes', 'tx_bytes',
    ];

    public function __construct(
        private readonly MonitoringSource $source,
        private readonly Settings $settings,
        private readonly Pressure $pressure,
    ) {}

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    public function hourly(): array
    {
        $start = CarbonImmutable::now();
        [$measurement, $report] = $this->gate();

        if ($report !== null) {
            return $report;
        }

        $until = $start->startOfHour();
        $cursor = Cursor::time(State::ROLLUP_HOUR, $until, new DateInterval('PT'.self::MAX_HOURS_PER_PASS.'H'));
        $nodes = $this->nodeIds();
        $deadline = $start->getTimestamp() + $this->settings->maxDurationSeconds();
        $written = 0;
        $buckets = 0;

        while ($cursor->lt($until)) {
            if (time() > $deadline) {
                Cursor::write(State::ROLLUP_HOUR, $cursor);

                return $this->result($written, $buckets, $measurement['level'], 'deadline');
            }

            $end = $cursor->addHour();
            $rows = $this->source->rollup($cursor, $end, 3600, array_keys($nodes));

            if ($rows !== []) {
                $rows = $this->decorate($rows, $this->source->transitions($cursor, $end), $nodes, $cursor);
                $written += ServerSeries::query()->upsert($rows, ['server_id', 'resolution', 'bucket'], self::UPDATE);
                $buckets++;
            }

            $cursor = $end;
            Cursor::write(State::ROLLUP_HOUR, $cursor);
        }

        return $this->result($written, $buckets, $measurement['level'], null);
    }

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    public function daily(): array
    {
        $start = CarbonImmutable::now();
        [$measurement, $report] = $this->gate();

        if ($report !== null) {
            return $report;
        }

        $until = $start->startOfDay();
        $cursor = Cursor::time(State::ROLLUP_DAY, $until, new DateInterval('P'.self::MAX_DAYS_PER_PASS.'D'));
        $deadline = $start->getTimestamp() + $this->settings->maxDurationSeconds();
        $written = 0;
        $buckets = 0;

        while ($cursor->lt($until)) {
            if (time() > $deadline) {
                Cursor::write(State::ROLLUP_DAY, $cursor);

                return $this->result($written, $buckets, $measurement['level'], 'deadline');
            }

            $end = $cursor->addDay();
            $rows = $this->fold($this->hours($cursor, $end), $cursor);

            if ($rows !== []) {
                $written += ServerSeries::query()->upsert($rows, ['server_id', 'resolution', 'bucket'], self::UPDATE);
                $buckets++;
            }

            $cursor = $end;
            Cursor::write(State::ROLLUP_DAY, $cursor);
        }

        return $this->result($written, $buckets, $measurement['level'], null);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @param  array<int, array{restarts: int, running: int, total: int}>  $transitions
     * @param  array<int, int|null>  $nodes
     * @return list<array<string, mixed>>
     */
    private function decorate(array $rows, array $transitions, array $nodes, CarbonImmutable $bucket): array
    {
        return array_map(static function (array $row) use ($transitions, $nodes, $bucket): array {
            $id = (int) $row['server_id'];
            $seen = $transitions[$id] ?? null;

            return array_merge($row, [
                'node_id' => $nodes[$id] ?? null,
                'bucket' => $bucket->toDateTimeString(),
                'resolution' => ServerSeries::HOUR,
                'running_samples' => $seen['running'] ?? $row['running_samples'],
                'restarts' => $seen['restarts'] ?? 0,
            ]);
        }, $rows);
    }

    /**
     * Hour rows for one day, keyed by server.
     *
     * @return array<int, list<array<string, mixed>>>
     */
    private function hours(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = ServerSeries::query()
            ->where('resolution', ServerSeries::HOUR)
            ->whereBetween('bucket', [$from->toDateTimeString(), $to->toDateTimeString()])
            ->get();

        $grouped = [];

        foreach ($rows as $row) {
            $grouped[(int) $row->server_id][] = $row;
        }

        return $grouped;
    }

    /**
     * Folds a day's hourly points into one row.
     *
     * The mean and extremes are weighted by sample count. The spread cannot be averaged
     * honestly, so it is rebuilt with the law of total variance from each hour's own
     * spread, mean and weight — which makes the daily figure agree with the hourly data
     * rather than quietly under-reading it.
     *
     * @param  array<int, list<\TroxeAnalytics\Models\ServerSeries>>  $grouped
     * @return list<array<string, mixed>>
     */
    private function fold(array $grouped, CarbonImmutable $bucket): array
    {
        $out = [];

        foreach ($grouped as $serverId => $hours) {
            $samples = $running = $restarts = $rx = $tx = 0;
            $cpuMax = $memoryMax = $diskMax = 0.0;
            $nodeId = null;

            foreach ($hours as $hour) {
                $samples += $hour->samples;
                $running += $hour->running_samples;
                $restarts += $hour->restarts;
                $rx += $hour->rx_bytes;
                $tx += $hour->tx_bytes;
                $cpuMax = max($cpuMax, $hour->cpu_max);
                $memoryMax = max($memoryMax, $hour->memory_max);
                $diskMax = max($diskMax, $hour->disk_max);
                $nodeId ??= $hour->node_id;
            }

            if ($samples === 0) {
                continue;
            }

            [$cpuAvg, $cpuStd] = self::spread($hours, 'cpu_avg', 'cpu_std', $samples);
            [$memoryAvg, $memoryStd] = self::spread($hours, 'memory_avg', 'memory_std', $samples);

            $out[] = [
                'server_id' => $serverId,
                'node_id' => $nodeId,
                'bucket' => $bucket->toDateTimeString(),
                'resolution' => ServerSeries::DAY,
                'samples' => $samples,
                'running_samples' => $running,
                'restarts' => $restarts,
                'cpu_avg' => round($cpuAvg, 2),
                'cpu_max' => round($cpuMax, 2),
                'cpu_std' => round($cpuStd, 3),
                'memory_avg' => (int) round($memoryAvg),
                'memory_max' => (int) $memoryMax,
                'memory_std' => (int) round($memoryStd),
                'disk_max' => (int) $diskMax,
                'rx_bytes' => $rx,
                'tx_bytes' => $tx,
            ];
        }

        return $out;
    }

    /**
     * @param  list<\TroxeAnalytics\Models\ServerSeries>  $hours
     * @return array{float, float}
     */
    private static function spread(array $hours, string $mean, string $deviation, int $samples): array
    {
        $weighted = 0.0;

        foreach ($hours as $hour) {
            $weighted += (float) $hour->{$mean} * $hour->samples;
        }

        $mean = $weighted / max(1, $samples);
        $variance = 0.0;

        foreach ($hours as $hour) {
            $variance += $hour->samples * (((float) $hour->{$deviation}) ** 2 + (((float) $hour->{$mean}) - $mean) ** 2);
        }

        return [$mean, sqrt($variance / max(1, $samples))];
    }

    /**
     * @return array{array<string, mixed>, array{written: int, buckets: int, level: string, stopped: string|null}|null}
     */
    private function gate(): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->enabled()) {
            return [$measurement, $this->result(0, 0, $measurement['level'], 'disabled')];
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return [$measurement, $this->result(0, 0, $measurement['level'], 'pressure')];
        }

        return [$measurement, null];
    }

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    private function result(int $written, int $buckets, string $level, ?string $stopped): array
    {
        return ['written' => $written, 'buckets' => $buckets, 'level' => $level, 'stopped' => $stopped];
    }

    /** @return array<int, int|null> server id => node id */
    private function nodeIds(): array
    {
        $nodes = [];

        foreach (DB::connection()->select('SELECT id, node_id FROM servers') as $server) {
            $nodes[(int) $server->id] = (int) $server->node_id;
        }

        return $nodes;
    }

}
