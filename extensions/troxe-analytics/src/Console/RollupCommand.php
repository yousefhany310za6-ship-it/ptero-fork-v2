<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\NodeHistory;
use TroxeAnalytics\Collectors\ServerRollups;

/**
 * Folds fine history into coarse history: minute node rows into hours and days, server
 * samples into hours and days.
 *
 * This is the heavy job, because it aggregates rather than observes, so it runs on its own
 * schedule rather than inside a collection pass, and it is the one that stops first when the
 * host is busy. A fold that does not finish leaves its cursor at the last bucket it wrote, so
 * the next run picks up where this one stopped.
 */
final class RollupCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:rollup';

    protected $description = 'Fold minute and hour history into the hour and day tiers.';

    public function handle(ServerRollups $servers, NodeHistory $nodes): int
    {
        return $this->pass('rollup', static function () use ($servers, $nodes): array {
            $runs = [$servers->hourly(), $servers->daily(), $nodes->hourly(), $nodes->daily()];
            $stopped = null;

            foreach ($runs as $run) {
                $stopped ??= $run['stopped'];
            }

            return [
                'written' => array_sum(array_column($runs, 'written')),
                'buckets' => array_sum(array_column($runs, 'buckets')),
                'level' => $runs[0]['level'],
                'stopped' => $stopped,
            ];
        });
    }
}
