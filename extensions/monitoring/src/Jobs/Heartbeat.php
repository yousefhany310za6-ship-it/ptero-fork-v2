<?php

declare(strict_types=1);

namespace Monitoring\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Cache;

/**
 * Proves the queue worker is alive, for the panel health card.
 */
final class Heartbeat implements ShouldQueue
{
    use Dispatchable;
    use Queueable;

    public const string KEY = 'ext:monitoring:queue_at';

    public function __construct()
    {
        $this->onQueue('low');
    }

    public function handle(): void
    {
        Cache::forever(self::KEY, now()->toAtomString());
    }
}
