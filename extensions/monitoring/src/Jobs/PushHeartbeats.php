<?php

declare(strict_types=1);

namespace Monitoring\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Http;
use Monitoring\Models\Push;
use Monitoring\Models\Sample;
use Monitoring\Settings;
use Monitoring\Support\State;
use Monitoring\Support\Targets;
use RuntimeException;
use Throwable;

/**
 * Tells every Uptime Kuma push monitor whether its server is running.
 */
final class PushHeartbeats implements ShouldQueue
{
    use Dispatchable;
    use Queueable;

    public int $tries = 1;

    public int $timeout = 55;

    public function __construct()
    {
        $this->onQueue('standard');
    }

    public function handle(Settings $settings): void
    {
        $started = microtime(true);

        foreach (Push::query()->get() as $push) {
            if (microtime(true) - $started > 45) {
                break;
            }

            $sample = Sample::query()->where('server_id', $push->server_id)->latest('sampled_at')->first();

            // Nothing is sent while the node is unreachable, so Kuma's own timeout reports it.
            if ($sample === null || $sample->state === State::UNREACHABLE) {
                continue;
            }

            $this->push($push, $sample, $settings->allowPrivateTargets());
        }
    }

    private function push(Push $push, Sample $sample, bool $allowPrivate): void
    {
        $up = $sample->isRunning();

        try {
            if (($problem = Targets::problem($push->url, $allowPrivate)) !== null) {
                throw new RuntimeException($problem);
            }

            Http::timeout(5)->connectTimeout(3)->withoutRedirecting()->get($push->url, [
                'status' => $up ? 'up' : 'down',
                'msg' => State::name($sample->state),
                'ping' => '',
            ])->throw();

            $push->update(['last_up' => $up, 'last_error' => null, 'pushed_at' => now()]);
        } catch (Throwable $exception) {
            $push->update(['last_error' => mb_substr($exception->getMessage(), 0, 191)]);
        }
    }
}
