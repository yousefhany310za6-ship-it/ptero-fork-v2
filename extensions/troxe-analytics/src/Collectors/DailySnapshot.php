<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\ServerSeries;
use TroxeAnalytics\Models\Snapshot;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Support\Pressure;

/**
 * The census that makes growth and loss visible.
 *
 * A server row is deleted outright rather than flagged, and so is a customer, so "how many
 * did we have in March" cannot be answered after the fact from the tables themselves. This
 * pass takes one row per day holding the counts and the totals as they stood, and because it
 * refreshes the same day's row on every run, the figure an administrator reads for a past day
 * is the last state observed on that day — not an estimate rebuilt later.
 *
 * Creation and deletion counts come from the panel's own activity log rather than from a
 * difference between two censuses: a difference would read a deletion as a creation that
 * never happened whenever an object was replaced on the same day.
 *
 * A census cannot be taken retroactively. The first row is the first day this ran, and the
 * customer screen says so instead of drawing a trend line back to a date it never measured.
 */
final class DailySnapshot
{
    private const string SERVER_CREATED = 'admin:server.create';

    private const string SERVER_DELETED = 'admin:server.delete';

    /** Both the account screen and an admin can open an account, so a sign-up is either. */
    private const array USER_CREATED = ['user:user.create', 'admin:user.create'];

    public function __construct(
        private readonly PanelSource $panel,
        private readonly Settings $settings,
        private readonly Pressure $pressure,
    ) {}

    /**
     * @return array{written: int, level: string, stopped: string|null}
     */
    public function capture(): array
    {
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->enabled()) {
            return $this->result(0, $measurement['level'], 'disabled');
        }

        // Unlike the other passes this one is a handful of aggregate counts on tables whose
        // size is the fleet, so load-shedding it buys nothing; it is skipped only when the
        // host has run out of headroom entirely.
        if (! $this->pressure->mayProceed($measurement)) {
            return $this->result(0, $measurement['level'], 'pressure');
        }

        $today = CarbonImmutable::now()->startOfDay();
        $census = $this->panel->census();

        $row = array_merge($census, $this->movements($today), [
            'bucket' => $today->toDateString(),
            'servers_active' => $this->activeServers($today),
        ]);

        Snapshot::query()->upsert([$row], ['bucket'], [
            'users_total', 'users_admin', 'users_2fa',
            'servers_total', 'servers_suspended', 'servers_installing', 'servers_active',
            'nodes_total', 'allocations_total', 'allocations_used',
            'memory_allocated', 'disk_allocated', 'cpu_allocated',
            'servers_created', 'servers_deleted', 'users_created',
        ]);

        return $this->result(1, $measurement['level'], null);
    }

    /**
     * Servers with at least one running sample today, from this extension's own hour tier.
     * The day tier is only folded once the day has closed, so it cannot describe today.
     */
    private function activeServers(CarbonImmutable $from): int
    {
        $rows = DB::connection()->select(
            'SELECT COUNT(DISTINCT server_id) servers FROM ext_analytics_server_series'
            .' WHERE resolution = ? AND bucket >= ? AND running_samples > 0',
            [ServerSeries::HOUR, $from->toDateTimeString()],
        );

        return (int) ($rows[0]->servers ?? 0);
    }

    /**
     * Objects created and destroyed today, counted from the hourly event totals the security
     * pass already wrote. Summing rollups rather than the log itself keeps this pass free of
     * any scan of a table that has no index on its timestamp.
     *
     * @return array{servers_created: int, servers_deleted: int, users_created: int}
     */
    private function movements(CarbonImmutable $from): array
    {
        $events = [self::SERVER_CREATED, self::SERVER_DELETED, ...self::USER_CREATED];
        $placeholders = implode(',', array_fill(0, count($events), '?'));

        $rows = DB::connection()->select(
            'SELECT event, SUM(occurrences) occurrences FROM ext_analytics_security_events'
            ." WHERE bucket >= ? AND event IN ({$placeholders}) GROUP BY event",
            array_merge([$from->toDateTimeString()], $events),
        );

        $counted = [];

        foreach ($rows as $row) {
            $counted[(string) $row->event] = (int) $row->occurrences;
        }

        return [
            'servers_created' => $counted[self::SERVER_CREATED] ?? 0,
            'servers_deleted' => $counted[self::SERVER_DELETED] ?? 0,
            'users_created' => array_sum(array_map(
                static fn (string $event): int => $counted[$event] ?? 0,
                self::USER_CREATED,
            )),
        ];
    }

    /** @return array{written: int, level: string, stopped: string|null} */
    private function result(int $written, string $level, ?string $stopped): array
    {
        return ['written' => $written, 'level' => $level, 'stopped' => $stopped];
    }
}
