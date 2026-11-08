<?php

declare(strict_types=1);

namespace Monitoring\Alerts;

use Monitoring\Jobs\SendNotification;
use Monitoring\Models\Alert;
use Monitoring\Models\Channel;

final class Notifier
{
    public function opened(Alert $alert): void
    {
        $value = in_array($alert->rule->metric, ['cpu', 'memory', 'disk'], true) ? sprintf(' Now at %.1f%%.', $alert->value) : '';

        $this->send($alert, new Message("Alert: {$this->subject($alert)}", "{$alert->rule->describe()}.{$value}", false, $this->url($alert)));
    }

    public function resolved(Alert $alert): void
    {
        $minutes = max(1, (int) round($alert->started_at->diffInMinutes($alert->resolved_at ?? now())));

        $this->send($alert, new Message("Resolved: {$this->subject($alert)}", "{$alert->rule->describe()} is back to normal after {$minutes} min.", true, $this->url($alert)));
    }

    private function send(Alert $alert, Message $message): void
    {
        Channel::query()
            ->where('user_id', $alert->rule->user_id)
            ->whereIn('id', $alert->rule->channels)
            ->pluck('id')
            ->each(static fn (int $channel) => SendNotification::dispatch($channel, $message->toArray()));
    }

    private function subject(Alert $alert): string
    {
        return $alert->server?->name ?? ($alert->node ? "Node {$alert->node->name}" : 'Unknown');
    }

    private function url(Alert $alert): ?string
    {
        $base = mb_rtrim((string) config('app.url'), '/');

        return match (true) {
            $alert->server !== null => "{$base}/server/{$alert->server->uuidShort}/monitoring",
            $alert->node !== null => "{$base}/panel/monitoring",
            default => null,
        };
    }
}
