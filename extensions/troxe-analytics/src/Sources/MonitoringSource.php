<?php

declare(strict_types=1);

namespace TroxeAnalytics\Sources;

use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Container\Container;
use Illuminate\Support\Facades\DB;
use Monitoring\Health;
use Throwable;
use TroxeAnalytics\Support\Range;

/**
 * The one file in this extension that reads the monitoring extension's sample table.
 *
 * Everything else works on this extension's own rollups. Concentrating the coupling here —
 * and in `IncidentSource`, which reads monitoring's alerts rather than duplicating them —
 * means a monitoring change is a one- or two-file fix, and `requires.extensions.monitoring`
 * in the manifest is what guarantees the tables it reads exist before this extension is
 * allowed to enable.
 *
 * `ext_monitoring_samples` holds one row per server per sampling minute: cpu as a percent
 * of one thread, memory and disk in MiB, and rx/tx as the container's *cumulative* byte
 * counters. Traffic therefore has to be read as a difference, never as a sum — the
 * difference of the extremes inside a bucket under-reads traffic that crossed a container
 * restart, which is the price of not asking Wings twice as often.
 */
final class MonitoringSource
{
    public const string TABLE = 'ext_monitoring_samples';

    /** Wings state codes stored as `state` by the monitoring extension. */
    private const int RUNNING = 2;

    /** @var array<string, mixed>|null */
    private ?array $details = null;

    /** @return list<array{bucket: int, cpu_avg: float, cpu_max: float, memory_avg: float, memory_max: float, disk_max: float, rx: int, tx: int, samples: int}> */
    public function serverPoints(int $serverId, CarbonImmutable $from, CarbonImmutable $to, int $bucketSeconds): array
    {
        $bucket = $this->bucketSql($bucketSeconds);

        $rows = DB::connection()->select(
            "SELECT {$bucket} AS bucket, AVG(cpu) cpu_avg, MAX(cpu) cpu_max, AVG(memory) memory_avg,"
            .' MAX(memory) memory_max, MAX(disk) disk_max, COUNT(*) samples'
            .' FROM '.self::TABLE.' WHERE server_id = ? AND sampled_at >= ? AND sampled_at < ?'
            .' GROUP BY bucket ORDER BY bucket',
            [$serverId, $from->toDateTimeString(), $to->toDateTimeString()],
        );

        return array_map(static fn (object $row): array => [
            'bucket' => (int) $row->bucket,
            'cpu_avg' => round((float) $row->cpu_avg, 2),
            'cpu_max' => round((float) $row->cpu_max, 2),
            'memory_avg' => (int) round((float) $row->memory_avg),
            'memory_max' => (int) $row->memory_max,
            'disk_max' => (int) $row->disk_max,
            'samples' => (int) $row->samples,
        ], $rows);
    }

    /**
     * Traffic for a window, as the sum over servers of each server's counter movement.
     *
     * @return list<array{bucket: int, rx: int, tx: int}>
     */
    public function trafficPoints(CarbonImmutable $from, CarbonImmutable $to, int $bucketSeconds, ?int $serverId = null, ?int $nodeId = null): array
    {
        $sql = 'SELECT bucket, SUM(rx) rx, SUM(tx) tx FROM ('
            ." SELECT {$this->bucketSql($bucketSeconds)} AS bucket, server_id,"
            .' MAX(rx) - MIN(rx) AS rx, MAX(tx) - MIN(tx) AS tx'
            .' FROM '.self::TABLE.' WHERE sampled_at >= ? AND sampled_at < ?';

        $bindings = [$from->toDateTimeString(), $to->toDateTimeString()];
        [$sql, $bindings] = $this->scope($sql, $bindings, $serverId, $nodeId);

        $rows = DB::connection()->select($sql.' GROUP BY bucket, server_id) per_server GROUP BY bucket ORDER BY bucket', $bindings);

        return array_map(static fn (object $row): array => [
            'bucket' => (int) $row->bucket,
            'rx' => max(0, (int) $row->rx),
            'tx' => max(0, (int) $row->tx),
        ], $rows);
    }

    /**
     * Every server in one read: the average and peak across whatever was running in each
     * bucket. This is the raw tier of the fleet chart, and the reason it lives here is that
     * the minute samples have no node column — narrowing to one node means narrowing to that
     * node's servers, which is a subquery on the panel's own table rather than a filter here.
     *
     * @return list<array{bucket: int, servers: int, samples: int, cpu: float, cpu_max: float, memory: int, memory_max: int}>
     */
    public function fleetPoints(CarbonImmutable $from, CarbonImmutable $to, int $bucketSeconds, ?int $nodeId = null): array
    {
        $bucket = $this->bucketSql($bucketSeconds);
        $sql = 'SELECT '.$bucket.' AS bucket, COUNT(DISTINCT server_id) servers, COUNT(*) samples,'
            .' AVG(cpu) cpu, MAX(cpu) cpu_max, AVG(memory) memory, MAX(memory) memory_max'
            .' FROM '.self::TABLE.' WHERE sampled_at >= ? AND sampled_at < ?';
        $bindings = [$from->toDateTimeString(), $to->toDateTimeString()];
        [$sql, $bindings] = $this->scope($sql, $bindings, null, $nodeId);

        $rows = DB::connection()->select($sql.' GROUP BY bucket ORDER BY bucket', $bindings);

        return array_map(static fn (object $row): array => [
            'bucket' => (int) $row->bucket,
            'servers' => (int) $row->servers,
            'samples' => (int) $row->samples,
            'cpu' => round((float) $row->cpu, 2),
            'cpu_max' => round((float) $row->cpu_max, 2),
            'memory' => (int) round((float) $row->memory),
            'memory_max' => (int) $row->memory_max,
        ], $rows);
    }

    /**
     * The hour rows this extension stores for itself: one aggregate per server per bucket,
     * plus the running fraction and the count of stops and starts observed in it.
     *
     * @return list<array{server_id: int, node_id: int|null, cpu_avg: float, cpu_max: float, cpu_std: float, memory_avg: int, memory_max: int, memory_std: int, disk_max: int, rx_bytes: int, tx_bytes: int, samples: int, running_samples: int, restarts: int}>
     */
    public function rollup(CarbonImmutable $from, CarbonImmutable $to, int $bucketSeconds, array $serverIds): array
    {
        if ($serverIds === []) {
            return [];
        }

        $bucket = $this->bucketSql($bucketSeconds);
        $placeholders = implode(',', array_fill(0, count($serverIds), '?'));

        $rows = DB::connection()->select(
            "SELECT server_id, {$bucket} AS bucket, COUNT(*) samples,"
            .' AVG(cpu) cpu_avg, MAX(cpu) cpu_max, STDDEV_POP(cpu) cpu_std,'
            .' AVG(memory) memory_avg, MAX(memory) memory_max, STDDEV_POP(memory) memory_std,'
            .' MAX(disk) disk_max, SUM(running) running_samples,'
            .' MAX(rx) - MIN(rx) rx_bytes, MAX(tx) - MIN(tx) tx_bytes'
            .' FROM (SELECT server_id, sampled_at, cpu, memory, disk, rx, tx,'
            .' CAST(state = '.self::RUNNING.' AS unsigned) running'
            .' FROM '.self::TABLE." WHERE sampled_at >= ? AND sampled_at < ? AND server_id IN ({$placeholders})) live"
            ." GROUP BY server_id, bucket",
            array_merge([$from->toDateTimeString(), $to->toDateTimeString()], array_map(static fn (int $id): int => $id, $serverIds)),
        );

        return array_map(static fn (object $row): array => [
            'server_id' => (int) $row->server_id,
            'cpu_avg' => round((float) $row->cpu_avg, 2),
            'cpu_max' => round((float) $row->cpu_max, 2),
            'cpu_std' => round((float) $row->cpu_std, 3),
            'memory_avg' => (int) round((float) $row->memory_avg),
            'memory_max' => (int) $row->memory_max,
            'memory_std' => (int) round((float) $row->memory_std),
            'disk_max' => (int) $row->disk_max,
            'samples' => (int) $row->samples,
            'running_samples' => (int) $row->running_samples,
            'rx_bytes' => max(0, (int) $row->rx_bytes),
            'tx_bytes' => max(0, (int) $row->tx_bytes),
            'restarts' => 0,
        ], $rows);
    }

    /**
     * Restarts and running time per server in one window. A restart is a running sample
     * whose predecessor was not running, which `LAG` answers in a single read instead of
     * one query per server. The first sample of a window has no predecessor, so it cannot
     * invent a restart.
     *
     * @return array<int, array{restarts: int, running: int, total: int}>
     */
    public function transitions(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = DB::connection()->select(
            'SELECT server_id,'
            .' SUM(previous <> '.self::RUNNING." AND state = ".self::RUNNING.') restarts,'
            .' SUM(state = '.self::RUNNING.") running, COUNT(*) total"
            .' FROM (SELECT server_id, state, LAG(state) OVER (PARTITION BY server_id ORDER BY sampled_at) previous'
            .' FROM '.self::TABLE.' WHERE sampled_at >= ? AND sampled_at < ?) live'
            .' GROUP BY server_id',
            [$from->toDateTimeString(), $to->toDateTimeString()],
        );

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->server_id] = [
                'restarts' => (int) $row->restarts,
                'running' => (int) $row->running,
                'total' => (int) $row->total,
            ];
        }

        return $out;
    }

    /**
     * The oldest minute sample still kept, which decides whether a window can honestly be
     * drawn from raw data at all. Returns seconds of usable history, or null when the
     * table is empty.
     */
    public function rawHorizon(?CarbonImmutable $now = null): ?int
    {
        $oldest = DB::connection()->select('SELECT MIN(sampled_at) at FROM '.self::TABLE);
        $at = $oldest[0]->at ?? null;

        if ($at === null) {
            return null;
        }

        return (int) CarbonImmutable::parse($at)->diffInSeconds($now ?? CarbonImmutable::now(), false);
    }

    /** Seconds the raw tier can serve for the given series count, or null when empty. */
    public function horizonFor(int $series): ?int
    {
        $horizon = $this->rawHorizon();

        return $horizon === null ? null : (int) min($horizon, intdiv(Range::ROW_CAP * 60, max(1, $series)));
    }

    /**
     * The monitoring extension's own admin view of the fleet, asked from the CLI rather
     * than from a browser. Its Wings calls are cached sixty seconds and its node totals are
     * already what the panel shows an administrator, so reusing it keeps one definition of
     * "what this node looks like" instead of a second, slightly different one.
     *
     * It is fetched once per instance and resolved lazily: this extension must stay
     * constructible even when the monitoring extension is switched off.
     *
     * @return array<string, mixed>
     */
    private function details(): array
    {
        return $this->details ??= $this->attempt(
            static fn (): array => Container::getInstance()->make(Health::class)->details()
        ) ?? [];
    }

    /** @return list<array<string, mixed>> */
    public function nodes(): array
    {
        $list = $this->details()['node_list'] ?? null;

        return is_array($list) ? array_values($list) : [];
    }

    /** @return array<string, mixed> load, cpus, memory, disk and uptime of this machine */
    public function panelHost(): array
    {
        $host = $this->details()['host'] ?? null;

        return is_array($host) ? $host : [];
    }

    /** @return array{running: int, total: int}|null the fleet's live state, as monitoring sees it */
    public function headline(): ?array
    {
        $servers = $this->details()['servers'] ?? null;

        return is_array($servers) ? $servers : null;
    }

    /**
     * MiB in use, and MiB known to exist, from a node's capacity breakdown. The "other"
     * segment only exists when the panel can see the machine itself, so a remote node
     * reports its size with no usage rather than reporting server usage as machine usage.
     *
     * @param  array<string, mixed>  $capacity
     * @return array{used: int|null, total: int|null}
     */
    public static function consumed(array $capacity): array
    {
        $used = null;

        foreach ($capacity['segments'] ?? [] as $segment) {
            if (! in_array($segment['key'] ?? null, ['servers', 'other'], true)) {
                continue;
            }

            $used ??= 0;
            $used += (int) $segment['mib'];
        }

        if (($capacity['host'] ?? false) !== true) {
            $used = null;
        }

        return ['used' => $used, 'total' => isset($capacity['total']) ? (int) $capacity['total'] : null];
    }

    /**
     * Runs a monitoring call and treats any failure as "unknown". A node that is down, a
     * Wings that will not answer or a cache miss must not abort a collection pass.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T|null
     */
    private function attempt(Closure $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Restricts a read to one server or one node. Both filters name servers of this panel, so
     * they are ids this extension never takes from a request without checking them first.
     *
     * @param  list<mixed>  $bindings
     * @return array{0: string, 1: list<mixed>}
     */
    private function scope(string $sql, array $bindings, ?int $serverId, ?int $nodeId): array
    {
        if ($serverId !== null) {
            $sql .= ' AND server_id = ?';
            $bindings[] = $serverId;
        }

        if ($nodeId !== null) {
            $sql .= ' AND server_id IN (SELECT id FROM servers WHERE node_id = ?)';
            $bindings[] = $nodeId;
        }

        return [$sql, $bindings];
    }

    /**
     * The start of the bucket a sample falls in, as epoch seconds. Grouping to an integer
     * rather than to a formatted datetime is what lets every caller use the bucket as a
     * chart axis directly; a datetime string reaching PHP reads as its leading year digit
     * the moment anything casts it.
     */
    private function bucketSql(int $bucketSeconds): string
    {
        return 'FLOOR(UNIX_TIMESTAMP(sampled_at) / '.(int) $bucketSeconds.') * '.(int) $bucketSeconds;
    }
}
