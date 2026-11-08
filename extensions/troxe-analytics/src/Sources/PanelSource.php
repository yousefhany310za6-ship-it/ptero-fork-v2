<?php

declare(strict_types=1);

namespace TroxeAnalytics\Sources;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Server;

/**
 * Reads the panel's own tables for the figures that are not measurements: what was sold to
 * servers, how many objects exist, and what the panel recorded about who did what.
 *
 * Every query here is a single aggregate over a table whose size is bounded by the fleet,
 * run from the scheduled CLI process. None of them is on the request path, and none of them
 * joins a log table — `activity_logs` has no index on its timestamp, which is why the event
 * reader below walks forward from a primary key instead of searching by date.
 */
final class PanelSource
{
    /** Statuses in which a server exists but is not yet usable, straight from the panel's own model. */
    private const array INSTALLING = [Server::STATUS_INSTALLING, Server::STATUS_INSTALL_FAILED, Server::STATUS_REINSTALL_FAILED];

    /**
     * What servers were promised, per node: memory and disk in MiB, CPU as the sum of
     * percent-of-one-thread limits. The same aggregate the panel's own utilisation display
     * uses, so an administrator sees one definition of "allocated".
     *
     * @return array<int, array{servers: int, cpu: int, memory: int, disk: int}>
     */
    public function allocations(): array
    {
        $rows = DB::connection()->select(
            'SELECT node_id, COUNT(*) servers, COALESCE(SUM(cpu), 0) cpu,'
            .' COALESCE(SUM(memory), 0) memory, COALESCE(SUM(disk), 0) disk'
            .' FROM servers GROUP BY node_id'
        );

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->node_id] = [
                'servers' => (int) $row->servers,
                'cpu' => (int) $row->cpu,
                'memory' => (int) $row->memory,
                'disk' => (int) $row->disk,
            ];
        }

        return $out;
    }

    /**
     * The census a daily snapshot is built from, taken while the objects still exist. Servers
     * and users are hard-deleted rather than flagged, so a count not taken today is gone.
     *
     * A healthy server's `status` is NULL; only a problem carries a value, so "suspended" and
     * "installing" are matched against the panel's own constants and everything else counts
     * as an ordinary server.
     *
     * @return array{
     *     users_total: int, users_admin: int, users_2fa: int,
     *     servers_total: int, servers_suspended: int, servers_installing: int,
     *     nodes_total: int, allocations_total: int, allocations_used: int,
     *     memory_allocated: int, disk_allocated: int, cpu_allocated: int
     * }
     */
    public function census(): array
    {
        $installing = implode(',', array_fill(0, count(self::INSTALLING), '?'));

        $servers = $this->firstRow(
            'SELECT COUNT(*) total, SUM(status = ?) suspended,'
            ." SUM(status IN ({$installing})) installing,"
            .' COALESCE(SUM(memory), 0) memory, COALESCE(SUM(disk), 0) disk, COALESCE(SUM(cpu), 0) cpu'
            .' FROM servers',
            [Server::STATUS_SUSPENDED, ...self::INSTALLING],
        );

        $users = $this->firstRow('SELECT COUNT(*) total, SUM(root_admin) admin, SUM(use_totp) totp FROM users');
        $allocations = $this->firstRow('SELECT COUNT(*) total, SUM(server_id IS NOT NULL) used FROM allocations');

        return [
            'users_total' => (int) ($users->total ?? 0),
            'users_admin' => (int) ($users->admin ?? 0),
            'users_2fa' => (int) ($users->totp ?? 0),
            'servers_total' => (int) ($servers->total ?? 0),
            'servers_suspended' => (int) ($servers->suspended ?? 0),
            'servers_installing' => (int) ($servers->installing ?? 0),
            'nodes_total' => (int) DB::connection()->table('nodes')->count(),
            'allocations_total' => (int) ($allocations->total ?? 0),
            'allocations_used' => (int) ($allocations->used ?? 0),
            'memory_allocated' => (int) ($servers->memory ?? 0),
            'disk_allocated' => (int) ($servers->disk ?? 0),
            'cpu_allocated' => (int) ($servers->cpu ?? 0),
        ];
    }

    /**
     * The nodes as the panel defines them: what each was sold to host, and whether it is in
     * maintenance. Only these columns are read — a node row also carries the Wings bearer token,
     * which is not analytics' to look at, let alone to store or serve.
     *
     * @return array<int, array{name: string, fqdn: string, maintenance: bool, memory_total: int, disk_total: int}>
     */
    public function nodes(): array
    {
        $rows = DB::connection()->select(
            'SELECT id, name, fqdn, maintenance_mode, memory, memory_overallocate, disk, disk_overallocate FROM nodes ORDER BY name'
        );

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->id] = [
                'name' => (string) $row->name,
                'fqdn' => (string) $row->fqdn,
                'maintenance' => (bool) $row->maintenance_mode,
                'memory_total' => (int) $row->memory + max(0, (int) $row->memory_overallocate),
                'disk_total' => (int) $row->disk + max(0, (int) $row->disk_overallocate),
            ];
        }

        return $out;
    }

    /**
     * Addresses each node holds and how many of them carry a server. Both come straight from
     * the panel's own allocation records, which is what makes them exact in a way no host
     * measurement of a remote node could be.
     *
     * @return array<int, array{total: int, used: int}>
     */
    public function ipUse(): array
    {
        $out = [];

        foreach (DB::connection()->select(
            'SELECT node_id, COUNT(*) total, SUM(server_id IS NOT NULL) used FROM allocations GROUP BY node_id'
        ) as $row) {
            $out[(int) $row->node_id] = ['total' => (int) $row->total, 'used' => (int) $row->used];
        }

        return $out;
    }

    /** How many servers the window spans, which is what decides the tier a chart is read from. */
    public function serverCount(?int $nodeId = null): int
    {
        $query = DB::connection()->table('servers');

        if ($nodeId !== null) {
            $query->where('node_id', $nodeId);
        }

        return $query->count();
    }

    /**
     * What each account holds, largest first. The account is named by its login and nothing
     * else: an email address and a real name are not needed to answer "who is using the most",
     * and a metrics endpoint is not where they belong.
     *
     * @return list<array<string, float|int|string>>
     */
    public function owners(int $limit = 50): array
    {
        return array_map(static fn (object $row): array => [
            'user_id' => (int) $row->user_id,
            'username' => (string) $row->username,
            'servers' => (int) $row->servers,
            'memory' => (int) $row->memory,
            'disk' => (int) $row->disk,
            'cpu' => (int) $row->cpu,
        ], DB::connection()->select(
            'SELECT u.id user_id, u.username, COUNT(s.id) servers,'
            .' COALESCE(SUM(s.memory), 0) memory, COALESCE(SUM(s.disk), 0) disk, COALESCE(SUM(s.cpu), 0) cpu'
            .' FROM users u LEFT JOIN servers s ON s.owner_id = u.id'
            .' GROUP BY u.id, u.username ORDER BY servers DESC, cpu DESC LIMIT '.self::bound($limit, 200)
        ));
    }

    /**
     * Event counts for one closed time range, grouped by event name. Reading by timestamp is
     * fine for a single past day — the daily snapshot runs once — but not for a pass every
     * minute, which is why the security rollup uses activityAfter() instead.
     *
     * @return array<string, int>
     */
    public function eventCounts(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = DB::connection()->select(
            'SELECT event, COUNT(*) occurrences FROM activity_logs'
            .' WHERE timestamp >= ? AND timestamp < ? GROUP BY event',
            [$from->toDateTimeString(), $to->toDateTimeString()],
        );

        $out = [];

        foreach ($rows as $row) {
            $out[(string) $row->event] = (int) $row->occurrences;
        }

        return $out;
    }

    /**
     * Activity log rows after a cursor, oldest first. `id` is the only index that makes this
     * cheap, so the caller remembers the highest id it consumed rather than asking by date.
     *
     * @return list<array{id: int, event: string, at: CarbonImmutable}>
     */
    public function activityAfter(int $id, int $limit): array
    {
        $rows = DB::connection()->select(
            'SELECT id, event, timestamp FROM activity_logs WHERE id > ? ORDER BY id LIMIT '.(int) $limit,
            [$id],
        );

        return array_map(static fn (object $row): array => [
            'id' => (int) $row->id,
            'event' => (string) $row->event,
            'at' => CarbonImmutable::parse($row->timestamp),
        ], $rows);
    }

    /** @return object|null */
    private function firstRow(string $sql, array $bindings = []): ?object
    {
        $rows = DB::connection()->select($sql, $bindings);

        return $rows[0] ?? null;
    }

    /** A LIMIT is not a bound parameter in MySQL, so it is clamped and cast instead. */
    private static function bound(int $requested, int $ceiling): string
    {
        return (string) max(1, min($ceiling, $requested));
    }
}
