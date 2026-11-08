<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\DailySnapshot;

/**
 * Takes the census. Runs hourly against a single daily row so the figure an administrator
 * reads for a day is the last state seen on that day, and so a deletion that happens at 09:00
 * is already reflected in the same day's numbers.
 */
final class SnapshotCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:snapshot';

    protected $description = 'Refresh the daily census of accounts, servers and allocations.';

    public function handle(DailySnapshot $snapshot): int
    {
        return $this->pass('snapshot', fn (): array => $snapshot->capture());
    }
}
