<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\HttpAccessLog;

/**
 * Reads whatever the panel's access log gained since the last pass, then folds it into hours
 * and days. Tailing is cheap and incremental; a pass that finds nothing new costs one seek.
 */
final class HttpCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:http';

    protected $description = 'Count new access-log lines and roll them up.';

    public function handle(HttpAccessLog $log): int
    {
        return $this->pass('http', function () use ($log): array {
            $read = $log->collect();
            $runs = [$read, $log->hourly(), $log->daily()];
            $stopped = null;

            foreach ($runs as $run) {
                $stopped ??= $run['stopped'];
            }

            return [
                'entries' => $read['entries'],
                'written' => array_sum(array_column($runs, 'written')),
                'buckets' => $read['buckets'],
                'level' => $read['level'],
                'stopped' => $stopped,
            ];
        });
    }
}
