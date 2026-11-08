<?php

declare(strict_types=1);

namespace TroxeAnalytics\Collectors;

use Carbon\CarbonImmutable;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Settings;
use TroxeAnalytics\Support\Cursor;
use TroxeAnalytics\Support\Pressure;
use TroxeAnalytics\Support\Writer;

/**
 * How often each thing the panel already recorded happened, per hour.
 *
 * Nothing here watches a request or a process. `activity_logs` is written by the core for its
 * own audit trail — sign-ins and sign-in failures, server creation, suspension and deletion,
 * permission and settings changes — and this pass only counts those rows again, grouped by
 * hour and event name.
 *
 * The reason to keep the counts is that core prunes that table (90 days on this install),
 * while a security trend has to outlive the object it describes. The rows themselves stay
 * where they are: the timeline screen reads `activity_logs` directly and shows the same
 * entries the audit log screen does, so no second copy of anyone's history is made here.
 *
 * Reading is a walk forward from a stored primary key, never a search by date.
 * `activity_logs` has no index on its timestamp column, so a date range query would scan the
 * whole table every minute; `id > cursor ORDER BY id LIMIT n` uses the primary key and costs
 * the same whether the table holds a thousand rows or a million.
 */
final class SecurityHistory
{
    public function __construct(
        private readonly PanelSource $source,
        private readonly Settings $settings,
        private readonly Pressure $pressure,
        private readonly Writer $writer,
    ) {}

    /**
     * @return array{rows: int, events: int, level: string, stopped: string|null}
     */
    public function collect(): array
    {
        $start = CarbonImmutable::now();
        $measurement = $this->pressure->measure();
        $this->pressure->record($measurement);

        if (! $this->settings->collectSecurity()) {
            return $this->result(0, 0, $measurement['level'], 'disabled');
        }

        if (! $this->pressure->mayProceed($measurement)) {
            return $this->result(0, 0, $measurement['level'], 'pressure');
        }

        $budget = $this->pressure->rowsBudget($measurement);
        $deadline = $start->getTimestamp() + $this->settings->maxDurationSeconds();
        $cursor = Cursor::id(State::ACTIVITY_CURSOR);
        $seen = 0;
        $written = 0;

        do {
            $batch = $this->source->activityAfter($cursor, $budget);

            if ($batch === []) {
                break;
            }

            $rows = $this->count($batch);
            $written += $this->writer->accumulate(
                'ext_analytics_security_events',
                ['bucket', 'event', 'occurrences'],
                ['bucket', 'event'],
                ['occurrences'],
                $rows,
            );

            $cursor = (int) end($batch)['id'];
            $seen += count($batch);

            // The cursor is stored per batch, so a pass that is stopped mid-table starts the
            // next one exactly where this one finished.
            Cursor::writeId(State::ACTIVITY_CURSOR, $cursor);
        } while (count($batch) === $budget && time() < $deadline);

        return $this->result($seen, $written, $measurement['level'], time() > $deadline ? 'deadline' : null);
    }

    /**
     * @param  list<array{id: int, event: string, at: CarbonImmutable}>  $batch
     * @return list<array{bucket: string, event: string, occurrences: int}>
     */
    private function count(array $batch): array
    {
        $grouped = [];

        foreach ($batch as $row) {
            $hour = $row['at']->startOfHour();
            $key = $hour->getTimestamp().'|'.$row['event'];
            $grouped[$key] ??= ['bucket' => $hour->toDateTimeString(), 'event' => $row['event'], 'occurrences' => 0];
            $grouped[$key]['occurrences']++;
        }

        return array_values($grouped);
    }

    /** @return array{rows: int, events: int, level: string, stopped: string|null} */
    private function result(int $rows, int $events, string $level, ?string $stopped): array
    {
        return ['rows' => $rows, 'events' => $events, 'level' => $level, 'stopped' => $stopped];
    }
}
