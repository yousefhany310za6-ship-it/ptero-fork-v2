<?php

declare(strict_types=1);

namespace Monitoring\Console;

use Illuminate\Console\Command;
use Monitoring\Models\Alert;
use Monitoring\Models\Sample;
use Monitoring\Settings;

final class PruneCommand extends Command
{
    protected $signature = 'monitoring:prune';

    protected $description = 'Delete samples and resolved alerts that are past their retention.';

    public function handle(Settings $settings): int
    {
        $cutoff = now()->subDays($settings->retentionDays());
        $deleted = 0;

        do {
            $batch = Sample::query()->where('sampled_at', '<', $cutoff)->limit(5000)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $alerts = Alert::query()->whereNotNull('resolved_at')->where('resolved_at', '<', now()->subDays(90))->delete();

        $this->info("Deleted {$deleted} samples and {$alerts} alerts.");

        return self::SUCCESS;
    }
}
