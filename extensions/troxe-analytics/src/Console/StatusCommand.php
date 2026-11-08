<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterval;
use TroxeAnalytics\Support\DataHealth;

/**
 * What analytics is configured to do, what it has collected, and where it is stuck.
 *
 * This is the command an administrator runs when a chart is empty, and the one to run after
 * enabling the extension and before trusting anything on screen. It prints the same report the
 * dashboard reads, so the two cannot disagree about why a figure is missing.
 */
final class StatusCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:status';

    protected $description = 'Report what analytics is collecting, how far it has got, and where it is stuck.';

    public function handle(DataHealth $health): int
    {
        $this->declareLowPriority();

        $report = $health->report();

        foreach ([
            'Configuration' => $this->configuration($report['configuration']),
            'Collection pressure' => $this->pressure($report['pressure']),
            'Cursors' => $this->cursors($report['cursors']),
            'Stored history' => $this->history($report['stored'], $report['missing']),
            'Where the data comes from' => $this->sources($report['sources']),
            'Last run of each job' => $this->jobs($report['jobs']),
        ] as $title => $rows) {
            $this->line('<options=bold>'.$title.'</>');
            $this->table(['', 'value'], array_map(static fn (array $row): array => array_values($row), $rows));
        }

        return self::SUCCESS;
    }

    /** @param  array<string, mixed>  $configuration @return list<array{0: string, 1: string}> */
    private function configuration(array $configuration): array
    {
        $retention = (array) ($configuration['retention'] ?? []);
        $limits = (array) ($configuration['limits'] ?? []);

        return [
            ['enabled', $this->yesNo((bool) $configuration['enabled'])],
            ['nodes / http / security', $this->yesNo((bool) $configuration['nodes']).' / '.$this->yesNo((bool) $configuration['http']).' / '.$this->yesNo((bool) $configuration['security'])],
            ['retention minute/hour/day (days)', $this->text($retention, 'minute_days').' / '.$this->text($retention, 'hourly_days').' / '.$this->text($retention, 'daily_days')],
            ['retention http/security (days)', $this->text($retention, 'http_days').' / '.$this->text($retention, 'security_days')],
            ['load ceiling per core', (string) ($limits['load_ceiling'] ?? '?')],
            ['memory floor / disk floor (MiB)', $this->text($limits, 'memory_floor_mib').' / '.$this->text($limits, 'disk_floor_mib')],
            ['rows per pass / seconds per pass', $this->text($limits, 'rows_per_pass').' / '.$this->text($limits, 'seconds_per_pass')],
        ];
    }

    /** @param  array<string, mixed>  $pressure @return list<array{0: string, 1: string}> */
    private function pressure(array $pressure): array
    {
        if ($pressure['level'] === null) {
            return [['level', (string) ($pressure['note'] ?? 'never measured')]];
        }

        return [
            ['level', (string) $pressure['level']],
            ['reasons', $pressure['reasons'] === [] ? 'none' : implode('; ', (array) $pressure['reasons'])],
            ['cores / load per core', (string) $pressure['cores'].' / '.(string) $pressure['load_per_core']],
            ['memory available', $pressure['memory_available_mib'] === null ? '?' : $pressure['memory_available_mib'].' MiB'],
            ['disk free', $pressure['disk_free_mib'] === null ? '?' : $pressure['disk_free_mib'].' MiB'],
            ['measured at', (string) $pressure['measured_at']],
        ];
    }

    /** @param  array<string, mixed>  $cursors @return list<array{0: string, 1: string}> */
    private function cursors(array $cursors): array
    {
        if (isset($cursors['note'])) {
            return [['state', (string) $cursors['note']]];
        }

        return [
            ['last pass at', (string) ($cursors['last_pass_at'] ?? 'never')],
            ['activity log id', (string) $cursors['activity_id']],
            ['access log position', (int) $cursors['access_log_inode'] === 0 ? 'not started' : 'inode '.$cursors['access_log_inode'].' at byte '.$cursors['access_log_offset']],
            ['server hour / day rolled to', $this->at($cursors, 'server_hour').' / '.$this->at($cursors, 'server_day')],
            ['node hour / day rolled to', $this->at($cursors, 'node_hour').' / '.$this->at($cursors, 'node_day')],
            ['http hour / day rolled to', $this->at($cursors, 'http_hour').' / '.$this->at($cursors, 'http_day')],
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $stored
     * @param  list<string>  $missing
     * @return list<array{0: string, 1: string}>
     */
    private function history(array $stored, array $missing): array
    {
        $rows = array_map(fn (array $tier): array => [
            $tier['table'].($tier['tier'] === null ? '' : ' '.$tier['tier']),
            $this->format((int) $tier['rows'], $tier['oldest'], $tier['newest']),
        ], $stored);

        foreach ($missing as $table) {
            $rows[] = [$table, 'missing — migrations have not run'];
        }

        return $rows === [] ? [['nothing', 'no tables yet']] : $rows;
    }

    /** @param  array<string, mixed>  $sources @return list<array{0: string, 1: string}> */
    private function sources(array $sources): array
    {
        $samples = (array) $sources['samples'];
        $log = (array) $sources['access_log'];
        $horizon = $samples['raw_horizon_seconds'] === null ? 'none' : CarbonImmutable::now()->subSeconds((int) $samples['raw_horizon_seconds'])->diffForHumans();

        $rows = [
            ['monitoring samples', $samples['present']
                ? number_format((int) $samples['rows']).' minute rows, raw horizon '.$horizon
                : 'table missing — the monitoring extension has never been enabled'],
            ['access log', $log['readable']
                ? $log['path'].' ('.number_format((int) $log['bytes']).' bytes)'
                : $log['path'].' — not readable'],
            ['activity log', number_format((int) $sources['activity_log']).' rows'],
        ];

        foreach ((array) $sources['notes'] as $note) {
            $rows[] = ['note', (string) $note];
        }

        return $rows;
    }

    /** @param  array<string, mixed>  $jobs @return list<array{0: string, 1: string}> */
    private function jobs(array $jobs): array
    {
        if ($jobs === []) {
            return [['never', 'no job has finished since the tables were created']];
        }

        $rows = [];

        foreach ($jobs as $job => $record) {
            $counts = array_diff_key((array) $record, array_flip(['at', 'seconds', 'level', 'stopped']));

            $rows[] = [
                (string) $job,
                (string) ($record['at'] ?? '?').' — '.json_encode($counts, JSON_UNESCAPED_SLASHES)
                    .' at '.($record['level'] ?? '?').' priority in '.($record['seconds'] ?? '?').'s'
                    .(($record['stopped'] ?? null) === null ? '' : ', stopped: '.$record['stopped']),
            ];
        }

        return $rows;
    }

    private function format(int $rows, mixed $oldest, mixed $newest): string
    {
        if ($rows === 0) {
            return '0 rows';
        }

        $span = CarbonInterval::seconds(CarbonImmutable::parse((string) $oldest)->diffInSeconds(CarbonImmutable::parse((string) $newest)))
            ->cascade()
            ->forHumans();

        return number_format($rows).' rows spanning '.$span;
    }

    /** @param  array<string, mixed>  $row */
    private function at(array $row, string $key): string
    {
        return (string) ($row[$key] ?? 'never');
    }

    /** @param  array<string, mixed>  $row */
    private function text(array $row, string $key): string
    {
        return (string) ($row[$key] ?? '?');
    }

    private function yesNo(bool $value): string
    {
        return $value ? 'yes' : 'no';
    }
}
