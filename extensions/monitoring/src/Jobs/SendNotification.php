<?php

declare(strict_types=1);

namespace Monitoring\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Monitoring\Alerts\Message;
use Monitoring\Alerts\Sender;
use Monitoring\Models\Channel;

final class SendNotification implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    /** @param array{title: string, body: string, resolved: bool, url: string|null} $message */
    public function __construct(public int $channel, public array $message)
    {
        $this->onQueue('standard');
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [30, 120];
    }

    public function handle(Sender $sender): void
    {
        $channel = Channel::query()->find($this->channel);

        if ($channel !== null) {
            $sender->send($channel, Message::fromArray($this->message));
        }
    }
}
