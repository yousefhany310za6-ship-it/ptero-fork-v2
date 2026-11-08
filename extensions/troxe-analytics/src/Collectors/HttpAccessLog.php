<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use DateInterval;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\HttpProbe;
use TroxeAnalytics\Models\HttpRoute;
use TroxeAnalytics\Models\HttpSeries;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Support\Cursor;
use TroxeAnalytics\Support\LogReader;
use TroxeAnalytics\Support\Pressure;
use TroxeAnalytics\Support\RouteNormalizer;
use TroxeAnalytics\Support\Writer;

/**
 * Panel request history, read from the nginx access log.
 *
 * This is the whole of how HTTP is measured here: the log is tailed from a scheduled process
 * at the lowest CPU and I/O priority the kernel offers, which keeps the counting of what the
 * panel served completely outside the path that serves it. No middleware, no instrumentation,
 * no cost added to any request.
 *
 * Two consequences of that choice are deliberate. The first is that no timing figure is ever
 * produced: this install logs the combined format, which carries no request duration, so
 * latency has no column and appears on no screen.
 *
 * The second is that traffic aimed at the machine is separated from traffic aimed at the
 * panel. Much of what reaches this host is internet scanning — requests for `.env`, `.git`
 * and `/wp-login.php` from addresses with no account here. Counted as panel traffic it would
 * make the panel look like it was failing constantly, so off-surface requests are stored by
 * source address in their own table, and the volume and error series describe only requests
 * that were actually aimed at the panel.
 *
 * Counters accumulate rather than replace, because two passes can land inside the same hour.
 * The byte offset is stored after the rows are written, so a pass interrupted in between
 * recounts a window instead of losing it.
 */
final class HttpAccessLog
{
    /** Bytes per line assumed when turning the row budget into a read budget. */
    private const int BYTES_PER_LINE = 512;

    private const int MAX_HOURS_PER_PASS = 48;

    private const int MAX_DAYS_PER_PASS = 7;

    private const array COUNTERS = ['requests', 'errors_4xx', 'errors_5xx'];

    public function __construct(
        private readonly Settings $settings,
        private readonly Pressure $pressure,
        private readonly LogReader $reader,
        private readonly Writer $writer,
    ) {}

    /**
     * Reads forward from the stored offset and writes what it found.
     *
     * @return array{entries: int, buckets: int, level: string, stopped: string|null}
     */
    public function collect(): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->collectHttp()) {
            return $this->read(0, 0, $measurement['level'], 'disabled');
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return $this->read(0, 0, $measurement['level'], 'pressure');
        }

        $path = $this->settings->nginxLog();

        if (! is_readable($path)) {
            return $this->read(0, 0, $measurement['level'], 'unreadable');
        }

        $read = $this->reader->read(
            $path,
            State::readInt(State::NGINX_INODE),
            State::readInt(State::NGINX_OFFSET),
            $this->pressure->rowsBudget($measurement) * self::BYTES_PER_LINE,
        );

        // Recording where the file was found is what makes rotation detectable next time, so
        // it happens even when there was nothing new to read.
        $this->storePosition($read['inode'], $read['offset']);

        if ($read['entries'] === []) {
            return $this->read(0, 0, $measurement['level'], null);
        }

        $groups = $this->group($read['entries']);

        $this->writer->accumulate(
            'ext_analytics_http_series',
            ['bucket', 'resolution', 'requests', 'errors_4xx', 'errors_5xx'],
            ['resolution', 'bucket'],
            self::COUNTERS,
            $this->seriesRows($groups['series']),
        );

        $this->writer->accumulate(
            'ext_analytics_http_routes',
            ['bucket', 'route', 'requests', 'errors'],
            ['bucket', 'route'],
            ['requests', 'errors'],
            $this->routeRows($groups['routes']),
        );

        $this->writer->accumulate(
            'ext_analytics_http_probes',
            ['bucket', 'address', 'requests', 'rejected', 'sample_path'],
            ['bucket', 'address'],
            ['requests', 'rejected'],
            $this->probeRows($groups['probes']),
        );

        return $this->read(count($read['entries']), count($groups['series']), $measurement['level'], null);
    }

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    public function hourly(): array
    {
        return $this->rollup(
            State::ROLLUP_HTTP_HOUR,
            HttpSeries::MINUTE,
            HttpSeries::HOUR,
            CarbonImmutable::now()->startOfHour(),
            new DateInterval('PT'.self::MAX_HOURS_PER_PASS.'H'),
            static fn (CarbonImmutable $at): CarbonImmutable => $at->addHour(),
        );
    }

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    public function daily(): array
    {
        return $this->rollup(
            State::ROLLUP_HTTP_DAY,
            HttpSeries::HOUR,
            HttpSeries::DAY,
            CarbonImmutable::now()->startOfDay(),
            new DateInterval('P'.self::MAX_DAYS_PER_PASS.'D'),
            static fn (CarbonImmutable $at): CarbonImmutable => $at->addDay(),
        );
    }

    /**
     * Sums one tier into the next. Only a closed bucket is ever folded — the cursor stops at
     * the start of the current hour or day — which is what lets a rollup replace its target
     * instead of adding to it: a bucket that is finished cannot change again.
     *
     * @param  callable(CarbonImmutable): CarbonImmutable  $step
     * @return array{written: int, buckets: int, level: string, stopped: string|null}
     */
    private function rollup(string $key, string $from, string $to, CarbonImmutable $until, DateInterval $lookback, callable $step): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->collectHttp()) {
            return $this->result(0, 0, $measurement['level'], 'disabled');
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return $this->result(0, 0, $measurement['level'], 'pressure');
        }

        $cursor = Cursor::time($key, $until, $lookback);
        $deadline = time() + $this->settings->maxDurationSeconds();
        $written = 0;
        $buckets = 0;

        while ($cursor->lt($until)) {
            if (time() > $deadline) {
                Cursor::write($key, $cursor);

                return $this->result($written, $buckets, $measurement['level'], 'deadline');
            }

            $end = $step($cursor);
            $written += $this->fold($cursor, $end, $from, $to);
            $buckets++;
            $cursor = $end;
            Cursor::write($key, $cursor);
        }

        return $this->result($written, $buckets, $measurement['level'], null);
    }

    private function fold(CarbonImmutable $from, CarbonImmutable $to, string $resolution, string $into): int
    {
        $counters = implode(', ', self::COUNTERS);
        $sums = implode(', ', array_map(
            static fn (string $column): string => "COALESCE(SUM({$column}), 0) {$column}",
            self::COUNTERS,
        ));
        $updates = implode(', ', array_map(
            static fn (string $column): string => "{$column} = VALUES({$column})",
            self::COUNTERS,
        ));

        return DB::affectingStatement(
            'INSERT INTO ext_analytics_http_series (bucket, resolution, '.$counters.')'
            ." SELECT ?, ?, {$sums} FROM ext_analytics_http_series"
            .' WHERE resolution = ? AND bucket >= ? AND bucket < ?'
            ." ON DUPLICATE KEY UPDATE {$updates}",
            [$from->toDateTimeString(), $into, $resolution, $from->toDateTimeString(), $to->toDateTimeString()],
        ) > 0 ? 1 : 0;
    }

    private function storePosition(int $inode, int $offset): void
    {
        State::write(State::NGINX_INODE, (string) $inode);
        State::write(State::NGINX_OFFSET, (string) $offset);
    }

    /**
     * @param  list<array{time: int, address: string, method: string, path: string, status: int}>  $entries
     * @return array{series: array<int, array{requests: int, errors_4xx: int, errors_5xx: int}>, routes: array<int, array<string, array{requests: int, errors: int}>>, probes: array<int, array<string, array{requests: int, rejected: int, path: string}>}
     */
    private function group(array $entries): array
    {
        $series = $routes = $probes = [];

        foreach ($entries as $entry) {
            $minute = CarbonImmutable::createFromTimestamp($entry['time'])->startOfMinute();
            $status = $entry['status'];
            $client = RouteNormalizer::isClientError($status);
            $server = RouteNormalizer::isServerError($status);
            $route = RouteNormalizer::normalize($entry['path']);

            // Scanner traffic is an exposure signal, not a panel request, so it never reaches
            // the volume or error series.
            if (RouteNormalizer::isOffSurface($route)) {
                $hour = $minute->startOfHour()->getTimestamp();
                $address = $entry['address'];
                $seen = $probes[$hour][$address] ?? ['requests' => 0, 'rejected' => 0, 'path' => $entry['path']];
                $seen['requests']++;
                $seen['rejected'] += $client || $server ? 1 : 0;
                $probes[$hour][$address] = $seen;

                continue;
            }

            $key = $minute->getTimestamp();
            $row = $series[$key] ?? ['requests' => 0, 'errors_4xx' => 0, 'errors_5xx' => 0];
            $row['requests']++;
            $row['errors_4xx'] += $client ? 1 : 0;
            $row['errors_5xx'] += $server ? 1 : 0;
            $series[$key] = $row;

            $hour = $minute->startOfHour()->getTimestamp();
            $seen = $routes[$hour][$route] ?? ['requests' => 0, 'errors' => 0];
            $seen['requests']++;
            $seen['errors'] += $client || $server ? 1 : 0;
            $routes[$hour][$route] = $seen;
        }

        return ['series' => $series, 'routes' => $routes, 'probes' => $probes];
    }

    /** @param array<int, array{requests: int, errors_4xx: int, errors_5xx: int}> $series */
    private function seriesRows(array $series): array
    {
        $out = [];

        foreach ($series as $timestamp => $row) {
            $out[] = [
                'bucket' => CarbonImmutable::createFromTimestamp($timestamp)->startOfMinute()->toDateTimeString(),
                'resolution' => HttpSeries::MINUTE,
            ] + $row;
        }

        return $out;
    }

    /** @param array<int, array<string, array{requests: int, errors: int}>> $routes */
    private function routeRows(array $routes): array
    {
        $out = [];

        foreach ($routes as $timestamp => $byRoute) {
            $bucket = CarbonImmutable::createFromTimestamp($timestamp)->startOfHour()->toDateTimeString();

            foreach ($byRoute as $route => $row) {
                $out[] = ['bucket' => $bucket, 'route' => $route] + $row;
            }
        }

        return $out;
    }

    /** @param array<int, array<string, array{requests: int, rejected: int, path: string}>> $probes */
    private function probeRows(array $probes): array
    {
        $out = [];

        foreach ($probes as $timestamp => $byAddress) {
            $bucket = CarbonImmutable::createFromTimestamp($timestamp)->startOfHour()->toDateTimeString();

            foreach ($byAddress as $address => $row) {
                $out[] = [
                    'bucket' => $bucket,
                    'address' => $address,
                    'requests' => $row['requests'],
                    'rejected' => $row['rejected'],
                    'sample_path' => mb_substr($row['path'], 0, 191),
                ];
            }
        }

        return $out;
    }

    /** @return array{entries: int, buckets: int, level: string, stopped: string|null} */
    private function read(int $entries, int $buckets, string $level, ?string $stopped): array
    {
        return ['entries' => $entries, 'buckets' => $buckets, 'level' => $level, 'stopped' => $stopped];
    }

    /** @return array{written: int, buckets: int, level: string, stopped: string|null} */
    private function result(int $written, int $buckets, string $level, ?string $stopped): array
    {
        return ['written' => $written, 'buckets' => $buckets, 'level' => $level, 'stopped' => $stopped];
    }
}
