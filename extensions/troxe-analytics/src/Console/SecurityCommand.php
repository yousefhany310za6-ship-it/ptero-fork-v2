<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\SecurityHistory;

/**
 * Counts what the panel already wrote into its own audit log. No request is observed to
 * produce these numbers, and nothing a person typed is kept: the counts are grouped by event
 * name and hour.
 */
final class SecurityCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:security';

    protected $description = 'Fold new activity-log rows into hourly event counts.';

    public function handle(SecurityHistory $history): int
    {
        return $this->pass('security', fn (): array => $history->collect());
    }
}
