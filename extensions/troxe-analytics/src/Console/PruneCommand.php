<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\Prune;

/**
 * Applies the retention windows. Unbounded growth is the one way an analytics system does
 * harm to the machine it runs on, so this job is what makes every other window in the
 * settings real rather than decorative.
 */
final class PruneCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:prune';

    protected $description = 'Delete analytics history that is past its retention.';

    public function handle(Prune $prune): int
    {
        return $this->pass('prune', fn (): array => $prune->run());
    }
}
