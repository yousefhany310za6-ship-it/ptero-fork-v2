<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use TroxeAnalytics\Models\HttpProbe;
use TroxeAnalytics\Models\HttpRoute;
use TroxeAnalytics\Models\HttpSeries;
use TroxeAnalytics\Models\NodeSeries;
use TroxeAnalytics\Models\SecurityEvent;
use TroxeAnalytics\Models\ServerSeries;
use TroxeAnalytics\Models\Snapshot;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Sources\MonitoringSource;

/**
 * What this extension is configured to do, what it has actually stored, and where it is stuck.
 *
 * The dashboard and `troxe-analytics:status` both read this one report, so a chart that is
 * empty and a terminal that says why cannot disagree. Everything here is a read of stored
 * state — cursors, row counts, the last pressure measurement, the last result of each job —
 * which is what makes it safe to consult from a browser: no pass is started and no node is
 * touched to answer it.
 *
 * The result is cached for a minute. Deciding the freshness of analytics data is bounded by
 * the collection interval anyway, and one `COUNT(*)` per tier per minute is the whole cost.
 */
final readonly class DataHealth
{
    private const string CACHE = 'ext:troxe-analytics:health';

    private const int CACHE_SECONDS = 60;

    /**
     * The tables worth reporting, as the span column and the column they are split by — a table
     * with no split column is counted once as a whole.
     *
     * @var array<string, array{0: string, 1: string|null}>
     */
    private const array TABLES = [
        ServerSeries::TABLE => ['bucket', 'resolution'],
        NodeSeries::TABLE => ['bucket', 'resolution'],
        HttpSeries::TABLE => ['bucket', 'resolution'],
        HttpRoute::TABLE => ['bucket', null],
        HttpProbe::TABLE => ['bucket', null],
        SecurityEvent::TABLE => ['bucket', null],
        Snapshot::TABLE => ['bucket', null],
    ];

    public function __construct(
        private Settings $settings,
        private Pressure $pressure,
        private MonitoringSource $monitoring,
    ) {}

    /** @return array<string, mixed> */
    public function report(): array
    {
        return Cache::remember(self::CACHE, self::CACHE_SECONDS, function (): array {
            $found = $this->tables();
            $present = array_values(array_filter(
                array_keys(self::TABLES),
                static fn (string $table): bool => in_array($table, $found, true),
            ));
            // Every cursor, the last pressure measurement and the record of what each job did
            // live in the state table. Asking for them before it exists would be an error page
            // about a database that has simply not been set up yet.
            $state = in_array(State::TABLE, $found, true);

            return [
                'generated_at' => CarbonImmutable::now()->toIso8601String(),
                'configuration' => $this->configuration(),
                'pressure' => $this->pressure($state),
                'cursors' => $this->cursors($state),
                'stored' => $this->stored($present),
                'sources' => $this->sources(),
                'jobs' => $this->jobs($state),
                'missing' => array_values(array_diff(array_keys(self::TABLES), $present)),
                // A single answer the interface can put in a banner: whether anything at all is
                // being collected, which is the difference between an empty chart and no chart.
                'collecting' => $this->settings->enabled() && $present !== [],
            ];
        });
    }

    /**
     * The four figures every screen needs to say whether what it is showing is real, and the
     * reasons an empty chart is empty. Derived from the same cached report, so a banner and a
     * detail table can never disagree.
     *
     * @return array<string, mixed>
     */
    public function banner(): array
    {
        $report = $this->report();

        return [
            'collecting' => $report['collecting'],
            'level' => $report['pressure']['level'],
            'reasons' => $report['pressure']['reasons'],
            'last_pass_at' => $report['cursors']['last_pass_at'] ?? null,
            'warnings' => $this->warnings($report),
            'generated_at' => $report['generated_at'],
        ];
    }

    /**
     * Why a figure may be missing, in the administrator's terms rather than in an error code.
     * This is what lets the interface say "the access log is not readable by the user the panel
     * runs as" instead of drawing a flat line at zero.
     *
     * @param  array<string, mixed>  $report
     * @return list<string>
     */
    private function warnings(array $report): array
    {
        $out = [];
        $configuration = (array) $report['configuration'];
        $sources = (array) $report['sources'];
        $samples = (array) $sources['samples'];
        $log = (array) $sources['access_log'];

        if (! $configuration['enabled']) {
            $out[] = 'Analytics is switched off, so nothing is being collected and every chart below is history.';
        }

        if ($report['missing'] !== []) {
            $out[] = 'Analytics tables are missing: '.implode(', ', (array) $report['missing']);
        }

        if ($report['pressure']['level'] === Pressure::PAUSED) {
            $out[] = 'Collection is paused by load. Stored figures are behind until the machine is quieter.';
        }

        if (! $samples['present']) {
            $out[] = 'The monitoring extension has never written a sample, so there is no per-minute detail for any chart.';
        }

        if (! $configuration['http']) {
            $out[] = 'Request counting is disabled in the analytics settings.';
        } elseif (! $log['readable']) {
            $out[] = 'The nginx access log at '.$log['path'].' cannot be read by the account the panel runs as.';
        }

        if (! $configuration['security']) {
            $out[] = 'Activity-event counting is disabled in the analytics settings.';
        }

        return $out;
    }

    /** @return list<string> every analytics table the database reports, whichever way it spells it */
    private function tables(): array
    {
        return array_map(
            static fn (object $row): string => strtolower((string) $row->table_name),
            DB::connection()->select(
                'SELECT TABLE_NAME table_name FROM information_schema.TABLES'
                ." WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'ext\\_analytics\\_%'"
            ),
        );
    }

    /** @return array<string, mixed> */
    private function configuration(): array
    {
        return [
            'enabled' => $this->settings->enabled(),
            'nodes' => $this->settings->collectNodes(),
            'http' => $this->settings->collectHttp(),
            'security' => $this->settings->collectSecurity(),
            'retention' => [
                'minute_days' => $this->settings->retainMinuteDays(),
                'hourly_days' => $this->settings->retainHourlyDays(),
                'daily_days' => $this->settings->retainDailyDays(),
                'http_days' => $this->settings->retainHttpDays(),
                'security_days' => $this->settings->retainSecurityDays(),
            ],
            'limits' => [
                'load_ceiling' => $this->settings->loadCeiling(),
                'memory_floor_mib' => $this->settings->memoryFloorMib(),
                'disk_floor_mib' => $this->settings->diskFloorMib(),
                'rows_per_pass' => $this->settings->maxRowsPerPass(),
                'seconds_per_pass' => $this->settings->maxDurationSeconds(),
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function pressure(bool $state): array
    {
        $last = $state ? $this->pressure->last() : null;

        if ($last === null) {
            return [
                'level' => null,
                'reasons' => [],
                'note' => $state ? 'no collection pass has run yet' : 'no state table yet',
            ];
        }

        return [
            'level' => $last['level'],
            'reasons' => array_values((array) ($last['reasons'] ?? [])),
            'cores' => $last['cores'] ?? null,
            'load_per_core' => $last['load_per_core'] ?? null,
            'memory_available_mib' => $last['memory_available'] === null ? null : intdiv((int) $last['memory_available'], 1048576),
            'disk_free_mib' => $last['disk_free'] === null ? null : intdiv((int) $last['disk_free'], 1048576),
            'measured_at' => $last['measured_at'] ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function cursors(bool $state): array
    {
        if (! $state) {
            return ['note' => 'no state table yet — the migrations have not run'];
        }

        return [
            'last_pass_at' => State::read(State::LAST_PASS),
            'activity_id' => State::readInt(State::ACTIVITY_CURSOR),
            'access_log_inode' => State::readInt(State::NGINX_INODE),
            'access_log_offset' => State::readInt(State::NGINX_OFFSET),
            'server_hour' => State::read(State::ROLLUP_HOUR),
            'server_day' => State::read(State::ROLLUP_DAY),
            'node_hour' => State::read(State::ROLLUP_NODE_HOUR),
            'node_day' => State::read(State::ROLLUP_NODE_DAY),
            'http_hour' => State::read(State::ROLLUP_HTTP_HOUR),
            'http_day' => State::read(State::ROLLUP_HTTP_DAY),
        ];
    }

    /**
     * Rows stored, per table and tier, with the span they cover. This is what tells an
     * administrator whether an empty chart means "nothing happened" or "nothing was collected".
     *
     * @param  list<string>  $present
     * @return list<array{table: string, tier: string|null, rows: int, oldest: string|null, newest: string|null}>
     */
    private function stored(array $present): array
    {
        $out = [];

        foreach ($present as $table) {
            [, $tier] = self::TABLES[$table];

            $rows = DB::connection()->select(
                $tier === null
                    ? "SELECT COUNT(*) row_count, MIN(bucket) oldest, MAX(bucket) newest FROM {$table}"
                    : "SELECT {$tier} tier, COUNT(*) row_count, MIN(bucket) oldest, MAX(bucket) newest FROM {$table} GROUP BY {$tier}"
            );

            foreach ($rows as $row) {
                $out[] = [
                    'table' => $table,
                    'tier' => isset($row->tier) ? (string) $row->tier : null,
                    'rows' => (int) $row->row_count,
                    'oldest' => $row->oldest === null ? null : (string) $row->oldest,
                    'newest' => $row->newest === null ? null : (string) $row->newest,
                ];
            }
        }

        return $out;
    }

    /**
     * Where each figure on the dashboard comes from, including the things this panel cannot
     * know. A source that is missing is reported as missing rather than drawn as a zero.
     *
     * @return array<string, mixed>
     */
    private function sources(): array
    {
        $connection = DB::connection();
        $samples = $connection->getSchemaBuilder()->hasTable(MonitoringSource::TABLE);
        $path = $this->settings->nginxLog();

        return [
            'samples' => [
                'present' => $samples,
                'rows' => $samples ? $connection->table(MonitoringSource::TABLE)->count() : 0,
                'raw_horizon_seconds' => $samples ? $this->monitoring->rawHorizon() : null,
            ],
            'access_log' => [
                'path' => $path,
                'readable' => is_readable($path),
                'bytes' => is_readable($path) ? (int) (@filesize($path) ?: 0) : 0,
            ],
            'activity_log' => $connection->table('activity_logs')->count(),
            'notes' => [
                'Node CPU, memory and disk usage are only measured on the machine the panel runs on: Wings reports no usage figures, so every other node is shown as capacity and allocation rather than as load.',
                'Request latency is not collected. The nginx log on this install carries no timing field, so no response-time figure is stored or drawn.',
                'Nothing is sampled during a user request; every figure on screen was written by a scheduled pass.',
            ],
        ];
    }

    /**
     * The last time each job ran and what it did.
     *
     * @return array<string, mixed>
     */
    private function jobs(bool $state): array
    {
        return $state ? State::readJson(State::LAST_RESULTS) : [];
    }
}
