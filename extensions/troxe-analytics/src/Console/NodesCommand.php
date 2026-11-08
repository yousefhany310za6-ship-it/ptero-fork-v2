<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use TroxeAnalytics\Collectors\NodeHistory;

final class NodesCommand extends AnalyticsCommand
{
    protected $signature = 'troxe-analytics:nodes';

    protected $description = 'Store one node-capacity row for the current minute.';

    public function handle(NodeHistory $history): int
    {
        return $this->pass('nodes', fn (): array => $history->sample());
    }
}
