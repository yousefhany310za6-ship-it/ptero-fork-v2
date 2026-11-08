<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\HttpProbe;
use TroxeAnalytics\Models\HttpRoute;
use TroxeAnalytics\Models\HttpSeries;
use TroxeAnalytics\Models\NodeSeries;
use TroxeAnalytics\Models\SecurityEvent;
use TroxeAnalytics\Models\ServerSeries;
use TroxeAnalytics\Models\Snapshot;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Support\Range;

/**
 * Every chart the dashboard draws, read from the cheapest tier that can honestly show it.
 *
 * This class reads; it never computes anything on the request path beyond what a single
 * grouped aggregate costs. Bucketing, averaging and summing all happen in SQL, and the
 * window a caller asks for is turned into a tier and a bucket width by `Range` before any
 * query is built, so a 90-day chart reads day rows and a 15-minute chart reads minute ones —
 * the number of rows touched is bounded by the row cap either way.
 *
 * Averages across servers are weighted by each bucket's own sample count. Averaging hourly
 * averages would give an hour with three samples the same say as an hour with sixty, and a
 * fleet figure built that way would drift away from what the same window shows for one
 * server.
 */
final readonly class History
{
    /**
     * What a request is allowed to rank a server list by: a fixed result column, always
     * largest first. Sorting is a choice of column, never a column name from the caller.
     *
     * @var array<string, string>
     */
    private const array ORDERS = [
        'cpu' => 'cpu DESC',
        'memory' => 'memory DESC',
        'disk' => 'disk DESC',
        'rx' => 'rx_bytes DESC',
        'tx' => 'tx_bytes DESC',
        'restarts' => 'restarts DESC',
        'uptime' => 'up DESC',
        'samples' => 'samples DESC',
    ];

    public function __construct(private MonitoringSource $monitoring) {}

    /**
     * One server's history. The raw tier comes from the collector layer's minute samples, which
     * is the only place the fine detail exists; anything older is read from this extension's
     * rollups.
     *
     * @return list<array<string, float|int|null>>
     */
    public function server(int $serverId, Range $range): array
    {
        if ($range->tier === Range::RAW) {
            $points = [];

            foreach ($this->monitoring->serverPoints($serverId, $range->from, $range->to, $range->bucketSeconds) as $point) {
                $points[$point['bucket']] = [
                    't' => $point['bucket'],
                    'cpu' => $point['cpu_avg'],
                    'cpu_peak' => $point['cpu_max'],
                    'memory' => $point['memory_avg'],
                    'memory_peak' => $point['memory_max'],
                    'disk' => $point['disk_max'],
                    'samples' => $point['samples'],
                    'rx' => 0.0,
                    'tx' => 0.0,
                ];
            }

            foreach ($this->monitoring->trafficPoints($range->from, $range->to, $range->bucketSeconds, $serverId) as $traffic) {
                if (! isset($points[$traffic['bucket']])) {
                    continue;
                }

                $points[$traffic['bucket']]['rx'] = $this->rate($traffic['rx'], $range->bucketSeconds);
                $points[$traffic['bucket']]['tx'] = $this->rate($traffic['tx'], $range->bucketSeconds);
            }

            return array_values($points);
        }

        return $this->points([
            'UNIX_TIMESTAMP('.self::bucket($range).') t',
            'SUM(samples) samples',
            'ROUND(SUM(cpu_avg * samples) / NULLIF(SUM(samples), 0), 2) cpu',
            'MAX(cpu_max) cpu_peak',
            'ROUND(SUM(memory_avg * samples) / NULLIF(SUM(samples), 0)) memory',
            'MAX(memory_max) memory_peak',
            'MAX(disk_max) disk',
            'ROUND(SUM(rx_bytes) / '.self::div($range).', 1) rx',
            'ROUND(SUM(tx_bytes) / '.self::div($range).', 1) tx',
            'ROUND(SUM(running_samples) / NULLIF(SUM(samples), 0), 4) up',
            'SUM(restarts) restarts',
        ], $range, ServerSeries::TABLE, ['server_id' => $serverId], self::rollup($range));
    }

    /**
     * The fleet, or one node's servers, as a single set of lines.
     *
     * @return list<array<string, float|int|null>>
     */
    public function fleet(Range $range, ?int $nodeId = null): array
    {
        if ($range->tier === Range::RAW) {
            $points = [];

            foreach ($this->monitoring->fleetPoints($range->from, $range->to, $range->bucketSeconds, $nodeId) as $point) {
                $points[$point['bucket']] = [
                    't' => $point['bucket'],
                    'servers' => $point['servers'],
                    'samples' => $point['samples'],
                    'cpu' => $point['cpu'],
                    'cpu_peak' => $point['cpu_max'],
                    'memory' => $point['memory'],
                    'memory_peak' => $point['memory_max'],
                    'rx' => 0.0,
                    'tx' => 0.0,
                ];
            }

            foreach ($this->monitoring->trafficPoints($range->from, $range->to, $range->bucketSeconds, null, $nodeId) as $traffic) {
                if (! isset($points[$traffic['bucket']])) {
                    continue;
                }

                $points[$traffic['bucket']]['rx'] = $this->rate($traffic['rx'], $range->bucketSeconds);
                $points[$traffic['bucket']]['tx'] = $this->rate($traffic['tx'], $range->bucketSeconds);
            }

            return array_values($points);
        }

        $where = $nodeId === null ? [] : ['node_id' => $nodeId];

        return $this->points([
            'UNIX_TIMESTAMP('.self::bucket($range).') t',
            'COUNT(DISTINCT server_id) servers',
            'SUM(samples) samples',
            'ROUND(SUM(cpu_avg * samples) / NULLIF(SUM(samples), 0), 2) cpu',
            'MAX(cpu_max) cpu_peak',
            'ROUND(SUM(memory_avg * samples) / NULLIF(SUM(samples), 0)) memory',
            'MAX(memory_max) memory_peak',
            'ROUND(SUM(rx_bytes) / '.self::div($range).', 1) rx',
            'ROUND(SUM(tx_bytes) / '.self::div($range).', 1) tx',
            'ROUND(SUM(running_samples) / NULLIF(SUM(samples), 0), 4) up',
            'SUM(restarts) restarts',
        ], $range, ServerSeries::TABLE, $where, self::rollup($range));
    }

    /**
     * One row per server for the window, which is what the servers list sorts and filters.
     *
     * Servers that were deleted still appear here as long as their rollups are inside the
     * window: the series table has no foreign key on purpose, because "how much did that
     * customer use" does not stop being a question when their server is removed. The join is
     * a left join for the same reason — a name is missing, the history is not.
     *
     * `$sort` names a column of the result, and is looked up in `ORDERS` rather than written
     * into the statement, so a request can choose which figure to rank by and nothing else.
     * `$search` is a name fragment and goes to the driver as a parameter.
     *
     * @return list<array<string, float|int|null>>
     */
    public function servers(Range $range, ?int $nodeId = null, int $limit = 100, string $sort = 'cpu', ?string $search = null): array
    {
        // The joined columns are aggregated rather than grouped so the statement stays legal
        // under ONLY_FULL_GROUP_BY, which this panel does not run but a moved database might.
        $sql = 'SELECT s.server_id,'
            .' COALESCE(MAX(sv.name), CAST(s.server_id AS CHAR)) name,'
            .' COALESCE(MAX(sv.uuidShort), "") short_id,'
            .' COALESCE(MAX(sv.node_id), MAX(s.node_id), 0) node_id,'
            .' COALESCE(MAX(sv.memory), 0) memory_limit,'
            .' COALESCE(MAX(sv.disk), 0) disk_limit,'
            .' COALESCE(MAX(sv.cpu), 0) cpu_limit,'
            .' SUM(s.samples) samples,'
            .' ROUND(SUM(s.cpu_avg * s.samples) / NULLIF(SUM(s.samples), 0), 2) cpu,'
            .' ROUND(MAX(s.cpu_max), 2) cpu_peak,'
            .' ROUND(SUM(s.memory_avg * s.samples) / NULLIF(SUM(s.samples), 0)) memory,'
            .' ROUND(MAX(s.memory_max)) memory_peak,'
            .' ROUND(MAX(s.disk_max)) disk,'
            .' SUM(s.rx_bytes) rx_bytes,'
            .' SUM(s.tx_bytes) tx_bytes,'
            .' ROUND(SUM(s.running_samples) / NULLIF(SUM(s.samples), 0), 4) up,'
            .' SUM(s.restarts) restarts'
            .' FROM '.ServerSeries::TABLE.' s'
            .' LEFT JOIN servers sv ON sv.id = s.server_id'
            .' WHERE s.resolution = ? AND s.bucket >= ? AND s.bucket < ?';

        $bindings = [self::rollup($range), $range->from->toDateTimeString(), $range->to->toDateTimeString()];

        if ($nodeId !== null) {
            // Filtering the series' own node column rather than the joined row keeps a deleted
            // server in the list of the node it used to belong to.
            $sql .= ' AND s.node_id = ?';
            $bindings[] = $nodeId;
        }

        if ($search !== null && $search !== '') {
            // Wildcards in what the administrator typed are characters to find, not operators.
            $sql .= ' AND sv.name LIKE ?';
            $bindings[] = '%'.addcslashes(mb_substr($search, 0, 64), '%_\\').'%';
        }

        $order = self::ORDERS[$sort] ?? self::ORDERS['cpu'];
        $sql .= ' GROUP BY s.server_id ORDER BY '.$order.' LIMIT '.self::bound($limit, 500);

        return $this->rows($sql, $bindings);
    }

    /**
     * Node history. Every usage column is null wherever the machine could not be measured,
     * and the caller is expected to say so rather than to draw a zero.
     *
     * @return list<array<string, float|int|null>>
     */
    public function node(int $nodeId, Range $range): array
    {
        return $this->points([
            'UNIX_TIMESTAMP('.self::bucket($range).') t',
            'SUM(samples) samples',
            'MAX(servers) servers',
            'ROUND(AVG(running), 2) running',
            'ROUND(AVG(cpu_pct), 2) cpu',
            'ROUND(AVG(load1), 2) load1',
            'ROUND(AVG(memory_used)) memory_used',
            'MAX(memory_total) memory_total',
            'ROUND(AVG(disk_used)) disk_used',
            'MAX(disk_total) disk_total',
            'MAX(memory_allocated) memory_allocated',
            'MAX(disk_allocated) disk_allocated',
            'MAX(cpu_allocated) cpu_allocated',
            'MAX(reachable) reachable',
        ], $range, NodeSeries::TABLE, ['node_id' => $nodeId], self::stored($range));
    }

    /**
     * Panel traffic over the window. Error columns exclude off-surface probes, so a scanner
     * hammering for `.env` never appears as a panel failure rate.
     *
     * @return list<array<string, float|int|null>>
     */
    public function http(Range $range): array
    {
        return $this->points([
            'UNIX_TIMESTAMP('.self::bucket($range).') t',
            'SUM(requests) requests',
            'SUM(errors_4xx) errors_4xx',
            'SUM(errors_5xx) errors_5xx',
        ], $range, HttpSeries::TABLE, [], self::stored($range));
    }

    /** @return list<array<string, float|int|string>> */
    public function routes(Range $range, int $limit = 20): array
    {
        return $this->rows(
            'SELECT route, SUM(requests) requests, SUM(errors) errors'
            .' FROM '.HttpRoute::TABLE.' WHERE bucket >= ? AND bucket < ?'
            .' GROUP BY route ORDER BY requests DESC LIMIT '.self::bound($limit, 100),
            [$range->from->toDateTimeString(), $range->to->toDateTimeString()],
        );
    }

    /**
     * Addresses that asked for something that is not part of the panel. This is an exposure
     * signal, not traffic: the requests were aimed at the machine, and the count is what
     * either got through or was refused.
     *
     * @return list<array<string, float|int|string>>
     */
    public function probes(Range $range, int $limit = 50): array
    {
        return $this->rows(
            'SELECT address, SUM(requests) requests, SUM(rejected) rejected, MAX(sample_path) sample_path'
            .' FROM '.HttpProbe::TABLE.' WHERE bucket >= ? AND bucket < ?'
            .' GROUP BY address ORDER BY requests DESC LIMIT '.self::bound($limit, 200),
            [$range->from->toDateTimeString(), $range->to->toDateTimeString()],
        );
    }

    /**
     * The panel's own audit events over the window, as totals plus the series that draws them.
     * The two reads share one list of event names so the chart can only ever show what the
     * legend counted.
     *
     * @return array{totals: list<array<string, float|int|string>>, series: list<array<string, float|int|string>>}
     */
    public function events(Range $range, int $limit = 12): array
    {
        $totals = $this->rows(
            'SELECT event, SUM(occurrences) occurrences'
            .' FROM '.SecurityEvent::TABLE.' WHERE bucket >= ? AND bucket < ?'
            .' GROUP BY event ORDER BY occurrences DESC LIMIT '.self::bound($limit, 50),
            [$range->from->toDateTimeString(), $range->to->toDateTimeString()],
        );

        if ($totals === []) {
            return ['totals' => [], 'series' => []];
        }

        $names = array_column($totals, 'event');
        $sql = 'SELECT UNIX_TIMESTAMP('.self::bucket($range).') t, event, SUM(occurrences) occurrences'
            .' FROM '.SecurityEvent::TABLE.' WHERE bucket >= ? AND bucket < ?'
            .' AND event IN ('.implode(',', array_fill(0, count($names), '?')).')'
            .' GROUP BY t, event ORDER BY t';

        return [
            'totals' => $totals,
            'series' => $this->rows($sql, [
                $range->from->toDateTimeString(),
                $range->to->toDateTimeString(),
                ...$names,
            ]),
        ];
    }

    /**
     * The most recent audit entries, for the security timeline. Only columns the panel needs
     * to describe an action are read: the `properties` blob is left in place, because it holds
     * whatever the actor typed, which is not analytics' to display.
     *
     * @return list<array<string, float|int|string|null>>
     */
    public function timeline(int $limit = 100): array
    {
        return $this->rows(
            'SELECT id, event, description, ip, actor_type, actor_id, timestamp'
            .' FROM activity_logs ORDER BY id DESC LIMIT '.self::bound($limit, 500)
        );
    }

    /**
     * The census series: one row per day this extension has taken a census on. Growth and
     * deletion trends exist nowhere else, because the objects themselves are deleted outright.
     *
     * @return list<array<string, float|int|string|null>>
     */
    public function census(CarbonImmutable $from): array
    {
        return $this->rows(
            'SELECT bucket, users_total, users_admin, users_2fa, servers_total, servers_suspended,'
            .' servers_installing, servers_active, nodes_total, allocations_total, allocations_used,'
            .' memory_allocated, disk_allocated, cpu_allocated, servers_created, servers_deleted, users_created'
            .' FROM '.Snapshot::TABLE.' WHERE bucket >= ? ORDER BY bucket',
            [$from->toDateString()],
        );
    }

    /**
     * How much of what was sold is actually being used, per server, over the window. This is
     * the distribution the resource page is about: the gap between what customers paid for and
     * what their processes consumed.
     *
     * @return list<array<string, float|int|null>>
     */
    public function utilisation(Range $range, int $limit = 200): array
    {
        return $this->rows(
            'SELECT s.server_id, COALESCE(MAX(sv.name), CAST(s.server_id AS CHAR)) name,'
            .' ROUND(SUM(s.cpu_avg * s.samples) / NULLIF(SUM(s.samples), 0), 2) cpu,'
            .' COALESCE(MAX(sv.cpu), 0) cpu_limit,'
            .' ROUND(SUM(s.memory_avg * s.samples) / NULLIF(SUM(s.samples), 0)) memory,'
            .' COALESCE(MAX(sv.memory), 0) memory_limit,'
            .' ROUND(MAX(s.disk_max)) disk, COALESCE(MAX(sv.disk), 0) disk_limit'
            .' FROM '.ServerSeries::TABLE.' s'
            .' LEFT JOIN servers sv ON sv.id = s.server_id'
            .' WHERE s.resolution = ? AND s.bucket >= ? AND s.bucket < ?'
            .' GROUP BY s.server_id HAVING SUM(s.samples) > 0 ORDER BY s.server_id'
            .' LIMIT '.self::bound($limit, 1000),
            [self::rollup($range), $range->from->toDateTimeString(), $range->to->toDateTimeString()],
        );
    }

    /**
     * The newest row each node has, for a node list. `MAX(bucket)` picks the row; joining back
     * for its columns keeps the read to one pass over the index.
     *
     * @return array<int, array<string, mixed>>
     */
    public function latestNodes(): array
    {
        $out = [];

        foreach ($this->rows(
            'SELECT n.* FROM '.NodeSeries::TABLE.' n'
            .' INNER JOIN (SELECT node_id, MAX(bucket) bucket FROM '.NodeSeries::TABLE
            .' WHERE resolution = ? GROUP BY node_id) last'
            .' ON last.node_id = n.node_id AND last.bucket = n.bucket',
            [NodeSeries::MINUTE],
        ) as $row) {
            $out[(int) $row['node_id']] = $row;
        }

        return $out;
    }

    /**
     * One grouped read over a series table, bound rather than concatenated: the `where` keys
     * are column names written by this class and never taken from a request, while every value
     * goes to the driver as a parameter.
     *
     * @param  list<string>  $select
     * @param  array<string, int|string>  $where
     * @return list<array<string, float|int|null>>
     */
    private function points(array $select, Range $range, string $table, array $where, string $resolution): array
    {
        $sql = 'SELECT '.implode(', ', $select).' FROM '.$table.' WHERE resolution = ? AND bucket >= ? AND bucket < ?';
        $bindings = [$resolution, $range->from->toDateTimeString(), $range->to->toDateTimeString()];

        foreach ($where as $column => $value) {
            $sql .= ' AND '.$column.' = ?';
            $bindings[] = $value;
        }

        return $this->rows($sql.' GROUP BY t ORDER BY t', $bindings);
    }

    /** @param list<mixed> $bindings @return list<array<string, mixed>> */
    private function rows(string $sql, array $bindings = []): array
    {
        return array_map(static function (object $row): array {
            $out = [];

            foreach ((array) $row as $key => $value) {
                // PDO hands numerics back as strings; a chart reading "12.5" as text either
                // draws nothing or draws it as a category.
                $out[$key] = is_string($value) && is_numeric($value) ? $value + 0 : $value;
            }

            return $out;
        }, DB::connection()->select($sql, $bindings));
    }

    /**
     * The SQL expression for one bucket. The width comes from `Range`, which only ever picks
     * from this extension's own step table, and is cast to an integer before it is written in.
     */
    private static function bucket(Range $range): string
    {
        $seconds = max(60, (int) $range->bucketSeconds);

        return 'FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(bucket) / '.$seconds.') * '.$seconds.')';
    }

    private static function div(Range $range): string
    {
        return (string) max(1, (int) $range->bucketSeconds);
    }

    /** A LIMIT is not user input, but it still gets clamped before it reaches the parser. */
    private static function bound(int $requested, int $ceiling): string
    {
        return (string) max(1, min($ceiling, $requested));
    }

    /**
     * The tier stored servers reach on: day rows for a window a day or wider, hour rows for
     * anything finer. This table has no minute tier — the minute detail lives in the collector's
     * own samples, which is why `Range` sends a raw window somewhere else entirely.
     */
    private static function rollup(Range $range): string
    {
        return $range->tier === Range::DAY ? ServerSeries::DAY : ServerSeries::HOUR;
    }

    /** The tier a table that keeps minute rows of its own answers a window from. */
    private static function stored(Range $range): string
    {
        return match ($range->tier) {
            Range::RAW => NodeSeries::MINUTE,
            Range::DAY => NodeSeries::DAY,
            default => NodeSeries::HOUR,
        };
    }

    /** Bytes in a bucket as bytes per second. */
    private function rate(int $bytes, int $seconds): float
    {
        return round($bytes / max(1, $seconds), 2);
    }
}
