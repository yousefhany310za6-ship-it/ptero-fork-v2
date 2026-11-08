<?php

declare(strict_types=1);

namespace Monitoring\Console;

use Illuminate\Console\Command;
use Monitoring\Alerts\Evaluator;
use Monitoring\Collector;
use Monitoring\Jobs\Heartbeat;
use Monitoring\Jobs\PushHeartbeats;

final class CollectCommand extends Command
{
    protected $signature = 'monitoring:collect';

    protected $description = 'Sample every server, check alert rules and push Uptime Kuma heartbeats.';

    public function handle(Collector $collector, Evaluator $evaluator): int
    {
        $collector->collect();
        $evaluator->evaluate();
        PushHeartbeats::dispatch();
        Heartbeat::dispatch();

        return self::SUCCESS;
    }
}
