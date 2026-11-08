<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\HttpSeries;
use TroxeAnalytics\Models\NodeSeries;
use TroxeAnalytics\Models\ServerSeries;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Support\Pressure;

/**
 * Deletes history past its retention, which is the only thing that keeps the database small.
 *
 * Growth is bounded by design rather than by hope: the per-minute tiers live for a couple of
 * days, hours for a quarter, days for two years, and every one of those windows is a setting.
 * The raw per-minute server samples are not touched here — the monitoring extension prunes
 * its own table, and reaching into another extension's data would be exactly the kind of
 * coupling this system is built to avoid.
 *
 * Deletes are chunked. A single statement removing a year of rows would hold a large lock and
 * generate a large amount of redo while customer queries are waiting behind it, so each pass
 * removes a bounded number of rows at a time, at the lowest I/O priority, and leaves the rest
 * for the next run. Nothing is ever deleted that a longer window asked to keep.
 */
final class Prune
{
    /** Rows removed per statement, so no single delete outlives a lock wait. */
    private const int CHUNK = 5000;

    public function __construct(
        private readonly Settings $settings,
        private readonly Pressure $pressure,
    ) {}

    /**
     * @return array{deleted: int, level: string, stopped: string|null}
     */
    public function run(): array
    {
        $start = CarbonImmutable::now();
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->enabled()) {
            return ['deleted' => 0, 'level' => $measurement['level'], 'stopped' => 'disabled'];
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return ['deleted' => 0, 'level' => $measurement['level'], 'stopped' => 'pressure'];
        }

        $deadline = $start->getTimestamp() + $this->settings->maxDurationSeconds();
        $deleted = 0;
        $stopped = null;

        foreach ($this->plan($start) as [$table, $where, $bound]) {
            $sql = 'DELETE FROM '.$table.' WHERE bucket < ?'.($where === '' ? '' : ' AND '.$where).' LIMIT '.self::CHUNK;

            do {
                $removed = DB::affectingStatement($sql, [$bound->toDateTimeString()]);
                $deleted += $removed;
            } while ($removed === self::CHUNK && time() < $deadline);

            if ($removed === self::CHUNK) {
                $stopped = 'deadline';

                break;
            }
        }

        return ['deleted' => $deleted, 'level' => $measurement['level'], 'stopped' => $stopped];
    }

    /**
     * What to remove and from when, as data rather than as code, so a new tier is one line in
     * this list and inherits the same chunking and the same deadline as every other one.
     *
     * Daily rows are the last of their series and are kept longest; hour rows survive the
     * minutes they were folded from, so a long window never becomes short when the fine tier
     * is dropped.
     *
     * @return list<array{0: string, 1: string, 2: CarbonImmutable}>
     */
    private function plan(CarbonImmutable $now): array
    {
        $minute = $now->subDays($this->settings->retainMinuteDays());
        $hour = $now->subDays($this->settings->retainHourlyDays());
        $http = $now->subDays($this->settings->retainHttpDays());
        $day = $now->subDays($this->settings->retainDailyDays());
        $security = $now->subDays($this->settings->retainSecurityDays());

        return [
            ['ext_analytics_server_series', $this->tier(ServerSeries::HOUR), $hour],
            ['ext_analytics_server_series', $this->tier(ServerSeries::DAY), $day],
            ['ext_analytics_node_series', $this->tier(NodeSeries::MINUTE), $minute],
            ['ext_analytics_node_series', $this->tier(NodeSeries::HOUR), $hour],
            ['ext_analytics_node_series', $this->tier(NodeSeries::DAY), $day],
            ['ext_analytics_http_series', $this->tier(HttpSeries::MINUTE), $minute],
            ['ext_analytics_http_series', $this->tier(HttpSeries::HOUR), $http],
            ['ext_analytics_http_series', $this->tier(HttpSeries::DAY), $day],
            ['ext_analytics_http_routes', '', $http],
            ['ext_analytics_http_probes', '', $http],
            ['ext_analytics_security_events', '', $security],
            ['ext_analytics_snapshots_daily', '', $day],
        ];
    }

    /**
     * The predicate for one tier of one table. The value is a constant from this extension's
     * own models and never comes from input, so it can be written into the statement.
     */
    private function tier(string $resolution): string
    {
        return 'resolution = \''.$resolution.'\'';
    }
}
