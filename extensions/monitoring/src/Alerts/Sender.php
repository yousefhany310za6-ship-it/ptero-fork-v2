<?php

declare(strict_types=1);

namespace Monitoring\Alerts;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Monitoring\Models\Channel;
use Monitoring\Settings;
use Monitoring\Support\Targets;
use RuntimeException;

/**
 * Delivers a message to one channel. Throws when the channel refuses it.
 */
final readonly class Sender
{
    public const array TYPES = ['discord', 'webhook', 'ntfy', 'telegram', 'email'];

    public function __construct(private Settings $settings) {}

    /** @return array<string, list<string>> Validation rules for the config of a channel type. */
    public static function rules(string $type): array
    {
        return match ($type) {
            'discord' => ['config.url' => ['required', 'url', 'max:500', 'regex:#^https://(?:\w+\.)?discord(?:app)?\.com/api/webhooks/#']],
            'webhook' => ['config.url' => ['required', 'url', 'max:500']],
            'ntfy' => ['config.url' => ['required', 'url', 'max:500'], 'config.token' => ['nullable', 'string', 'max:200']],
            'telegram' => ['config.token' => ['required', 'string', 'max:100', 'regex:/^\d+:[\w-]+$/'], 'config.chat' => ['required', 'string', 'max:64']],
            'email' => ['config.address' => ['required', 'email', 'max:191']],
            default => [],
        };
    }

    /** The URL a channel posts to, so it can be checked before saving and sending. */
    public static function target(Channel $channel): ?string
    {
        return in_array($channel->type, ['discord', 'webhook', 'ntfy'], true) ? $channel->config['url'] : null;
    }

    public function send(Channel $channel, Message $message): void
    {
        $target = self::target($channel);

        if ($target !== null && ($problem = Targets::problem($target, $this->settings->allowPrivateTargets())) !== null) {
            throw new RuntimeException($problem);
        }

        $text = $message->body.($message->url ? "\n{$message->url}" : '');

        $response = match ($channel->type) {
            'discord' => $this->http()->post($target, ['embeds' => [[
                'title' => $message->title,
                'description' => $message->body,
                'url' => $message->url,
                'color' => $message->resolved ? 0x22C55E : 0xEF4444,
                'timestamp' => now()->toIso8601String(),
            ]]]),
            'webhook' => $this->http()->post($target, ['event' => $message->resolved ? 'resolved' : 'alert'] + $message->toArray()),
            'ntfy' => $this->http()
                ->withHeaders(array_filter([
                    'Title' => $message->title,
                    'Tags' => $message->resolved ? 'white_check_mark' : 'warning',
                    'Priority' => $message->resolved ? '3' : '4',
                    'Click' => $message->url,
                    'Authorization' => empty($channel->config['token']) ? null : "Bearer {$channel->config['token']}",
                ]))
                ->withBody($message->body, 'text/plain')
                ->post($target),
            'telegram' => $this->http()->post("https://api.telegram.org/bot{$channel->config['token']}/sendMessage", [
                'chat_id' => $channel->config['chat'],
                'text' => "{$message->title}\n{$text}",
                'disable_web_page_preview' => true,
            ]),
            'email' => $this->mail($channel->config['address'], $message->title, $text),
            default => throw new RuntimeException("Unknown channel type {$channel->type}."),
        };

        if ($response !== null && $response->failed()) {
            throw new RuntimeException("{$channel->name} answered with HTTP {$response->status()}.");
        }
    }

    private function http(): \Illuminate\Http\Client\PendingRequest
    {
        return Http::timeout(10)->connectTimeout(5)->withoutRedirecting()->acceptJson();
    }

    private function mail(string $address, string $subject, string $text): null
    {
        Mail::raw($text, static fn ($mail) => $mail->to($address)->subject($subject));

        return null;
    }
}
