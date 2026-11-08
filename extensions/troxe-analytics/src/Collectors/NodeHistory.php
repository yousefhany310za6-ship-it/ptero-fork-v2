<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use DateInterval;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\NodeSeries;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Support\Cursor;
use TroxeAnalytics\Support\HostStat;
use TroxeAnalytics\Support\Pressure;

/**
 * Node history: one minute row per node per pass, folded into hours and then into days.
 *
 * What a node row can honestly hold depends on whether the panel shares that machine. Wings
 * answers a status request with the servers it is running, not with the machine underneath
 * them: `/api/system` carries architecture, cpu_count, kernel, os and version, and no usage
 * figure at all. So processor percentage, load and disk occupancy are measured from /proc
 * and stored only for the node the panel itself runs on, and every other node keeps its
 * capacity and its allocation with NULL usage. A dashboard reading a NULL shows the reason,
 * not a zero.
 *
 * The minute tier is not polled from Wings any harder than the monitoring extension already
 * does: one fleet-wide read per pass, the same view its admin page shows.
 */
final class NodeHistory
{
    /** Hours a single pass may catch up after an outage or a first run. */
    private const int MAX_HOURS_PER_PASS = 48;

    private const int MAX_DAYS_PER_PASS = 7;

    /** The measured columns, shared by the minute row and the two rollups above it. */
    private const array ROLLUP_COLUMNS = [
        'samples', 'servers', 'running', 'cpu_pct', 'load1', 'load5', 'load15',
        'memory_used', 'memory_total', 'disk_used', 'disk_total',
        'memory_allocated', 'disk_allocated', 'cpu_allocated', 'reachable',
    ];

    public function __construct(
        private readonly MonitoringSource $source,
        private readonly PanelSource $panel,
        private readonly Settings $settings,
        private readonly Pressure $pressure,
        private readonly HostStat $hostStat,
    ) {}

    /**
     * One row per node for the current minute.
     *
     * @return array{written: int, level: string, stopped: string|null}
     */
    public function sample(): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->collectNodes()) {
            return $this->result(0, $measurement['level'], 'disabled');
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return $this->result(0, $measurement['level'], 'pressure');
        }

        $nodes = $this->source->nodes();

        if ($nodes === []) {
            return $this->result(0, $measurement['level'], 'no_nodes');
        }

        $bucket = CarbonImmutable::now()->startOfMinute();
        $allocations = $this->panel->allocations();
        $host = $this->source->panelHost();
        $cpu = $this->hostStat->cpuPercent();
        $load = is_array($host['load'] ?? null) ? $host['load'] : [null, null, null];

        $rows = [];

        foreach ($nodes as $node) {
            $id = (int) ($node['id'] ?? 0);

            if ($id < 1) {
                continue;
            }

            // Only the machine the panel is on can be measured directly. `consumed()` already
            // returns null usage for a node that is not this host, so the same condition
            // decides CPU and load.
            $local = $node['panel_host'] === true;
            $memory = MonitoringSource::consumed(is_array($node['memory'] ?? null) ? $node['memory'] : []);
            $disk = MonitoringSource::consumed(is_array($node['disk'] ?? null) ? $node['disk'] : []);
            $sold = $allocations[$id] ?? ['cpu' => 0, 'memory' => 0, 'disk' => 0];
            $servers = is_array($node['servers'] ?? null) ? $node['servers'] : [];

            $rows[] = [
                'node_id' => $id,
                'bucket' => $bucket->toDateTimeString(),
                'resolution' => NodeSeries::MINUTE,
                'samples' => 1,
                // Provisioned count comes from the panel, live count from the samples the
                // collector has already taken, so neither figure asks Wings for anything.
                'servers' => (int) ($sold['servers'] ?? $servers['total'] ?? 0),
                'running' => (int) ($servers['running'] ?? 0),
                'cpu_pct' => $local ? $cpu : null,
                'load1' => $local ? $this->float($load[0] ?? null) : null,
                'load5' => $local ? $this->float($load[1] ?? null) : null,
                'load15' => $local ? $this->float($load[2] ?? null) : null,
                'memory_used' => $memory['used'],
                'memory_total' => $memory['total'],
                'disk_used' => $disk['used'],
                'disk_total' => $disk['total'],
                'memory_allocated' => $sold['memory'],
                'disk_allocated' => $sold['disk'],
                'cpu_allocated' => $sold['cpu'],
                'reachable' => $this->bool($node['reachable'] ?? null),
            ];
        }

        if ($rows === []) {
            return $this->result(0, $measurement['level'], 'no_nodes');
        }

        $written = NodeSeries::query()->upsert($rows, ['node_id', 'resolution', 'bucket'], self::ROLLUP_COLUMNS);

        return $this->result($written, $measurement['level'], null);
    }

    /** @return array{written: int, level: string, stopped: string|null} */
    public function hourly(): array
    {
        return $this->rollup(
            State::ROLLUP_NODE_HOUR,
            NodeSeries::MINUTE,
            NodeSeries::HOUR,
            CarbonImmutable::now()->startOfHour(),
            new DateInterval('PT'.self::MAX_HOURS_PER_PASS.'H'),
            static fn (CarbonImmutable $at): CarbonImmutable => $at->addHour(),
        );
    }

    /** @return array{written: int, level: string, stopped: string|null} */
    public function daily(): array
    {
        return $this->rollup(
            State::ROLLUP_NODE_DAY,
            NodeSeries::HOUR,
            NodeSeries::DAY,
            CarbonImmutable::now()->startOfDay(),
            new DateInterval('P'.self::MAX_DAYS_PER_PASS.'D'),
            static fn (CarbonImmutable $at): CarbonImmutable => $at->addDay(),
        );
    }

    /**
     * Folds one tier into the next, entirely inside the database.
     *
     * Averages ignore NULL, which is exactly what an absent measurement should do: it leaves
     * the figure unknown rather than pulling it toward zero. Extremes are kept by MAX because
     * a node that peaked at 90% in the hour did peak at 90%, and `reachable` by MAX because
     * one accepted sample in a bucket is enough to say the node was reachable in it — while a
     * bucket of nothing but unknowns stays unknown.
     *
     * @param  callable(CarbonImmutable): CarbonImmutable  $step
     * @return array{written: int, level: string, stopped: string|null}
     */
    private function rollup(string $key, string $from, string $to, CarbonImmutable $until, DateInterval $lookback, callable $step): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->collectNodes()) {
            return $this->result(0, $measurement['level'], 'disabled');
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return $this->result(0, $measurement['level'], 'pressure');
        }

        $cursor = Cursor::time($key, $until, $lookback);
        $deadline = time() + $this->settings->maxDurationSeconds();
        $written = 0;

        while ($cursor->lt($until)) {
            if (time() > $deadline) {
                return $this->result($written, $measurement['level'], 'deadline');
            }

            $end = $step($cursor);
            $written += $this->fold($cursor, $end, $from, $to);
            $cursor = $end;
            Cursor::write($key, $cursor);
        }

        return $this->result($written, $measurement['level'], null);
    }

    private function fold(CarbonImmutable $from, CarbonImmutable $to, string $resolution, string $into): int
    {
        $select = [];
        $update = [];

        foreach (self::ROLLUP_COLUMNS as $column) {
            $aggregate = match (true) {
                $column === 'samples' => 'SUM(samples)',
                in_array($column, ['servers', 'memory_total', 'disk_total', 'memory_allocated', 'disk_allocated', 'cpu_allocated', 'disk_used', 'reachable'], true) => "MAX({$column})",
                default => "ROUND(AVG({$column}))",
            };

            // CPU and load are already averages of a continuous reading; rounding the average
            // of those to whole numbers would throw away the only precision they carry.
            if (in_array($column, ['cpu_pct', 'load1', 'load5', 'load15'], true)) {
                $aggregate = "AVG({$column})";
            }

            $select[] = $aggregate.' '.$column;
            $update[] = "{$column} = VALUES({$column})";
        }

        // One folded bucket, or none: an hour in which no node was sampled writes no rows, and
        // MySQL counts an updated row as two affected rows, so the engine's own figure says
        // nothing about how much history was produced.
        return DB::affectingStatement(
            'INSERT INTO ext_analytics_node_series (node_id, bucket, resolution, '.implode(', ', self::ROLLUP_COLUMNS).')'
            .' SELECT node_id, ?, ?, '.implode(', ', $select)
            .' FROM ext_analytics_node_series WHERE resolution = ? AND bucket >= ? AND bucket < ?'
            .' GROUP BY node_id'
            .' ON DUPLICATE KEY UPDATE '.implode(', ', $update),
            [
                $from->toDateTimeString(),
                $into,
                $resolution,
                $from->toDateTimeString(),
                $to->toDateTimeString(),
            ],
        ) > 0 ? 1 : 0;
    }

    private function float(mixed $value): ?float
    {
        return is_numeric($value) ? round((float) $value, 3) : null;
    }

    private function bool(mixed $value): ?bool
    {
        return $value === null ? null : (bool) $value;
    }

    /** @return array{written: int, level: string, stopped: string|null} */
    private function result(int $written, string $level, ?string $stopped): array
    {
        return ['written' => $written, 'level' => $level, 'stopped' => $stopped];
    }
}
