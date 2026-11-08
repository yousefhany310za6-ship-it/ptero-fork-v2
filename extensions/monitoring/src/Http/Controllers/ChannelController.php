<?php

declare(strict_types=1);

namespace Monitoring\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule as ValidationRule;
use Monitoring\Alerts\Message;
use Monitoring\Alerts\Sender;
use Monitoring\Models\Channel;
use Monitoring\Settings;
use Monitoring\Support\Targets;
use Throwable;

/**
 * Notification channels belong to the signed-in user and are picked when creating rules.
 */
final class ChannelController
{
    public function __construct(private readonly Sender $sender, private readonly Settings $settings) {}

    public function index(Request $request): JsonResponse
    {
        return new JsonResponse([
            'channels' => Channel::query()->where('user_id', $request->user()->id)->orderBy('name')->get()->map(static fn (Channel $channel): array => [
                'id' => $channel->id,
                'name' => $channel->name,
                'type' => $channel->type,
                'summary' => self::summary($channel),
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_if(Channel::query()->where('user_id', $request->user()->id)->count() >= 20, 422, 'You can have up to 20 channels.');

        Channel::query()->create($this->validated($request) + ['user_id' => $request->user()->id]);

        return $this->index($request);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $channel = $this->find($request, $id);
        $channel->update($this->validated($request, $channel));

        return $this->index($request);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->find($request, $id)->delete();

        return $this->index($request);
    }

    public function test(Request $request, int $id): JsonResponse
    {
        $channel = $this->find($request, $id);

        try {
            $this->sender->send($channel, new Message('Test notification', "Alerts from {$this->panelName()} will arrive here.", false, config('app.url')));
        } catch (Throwable $exception) {
            abort(422, 'Sending failed: '.mb_substr($exception->getMessage(), 0, 200));
        }

        return new JsonResponse(['sent' => true]);
    }

    /** Where a channel sends to, without its secrets. */
    private static function summary(Channel $channel): string
    {
        return match ($channel->type) {
            'email' => $channel->config['address'],
            'telegram' => "Chat {$channel->config['chat']}",
            default => (string) parse_url($channel->config['url'], PHP_URL_HOST),
        };
    }

    /**
     * Empty fields keep the saved value when the type stays the same, so secrets never have to be shown again.
     *
     * @return array{name: string, type: string, config: array<string, string>}
     */
    private function validated(Request $request, ?Channel $existing = null): array
    {
        $type = (string) $request->input('type');

        if ($existing?->type === $type) {
            $request->merge(['config' => array_merge($existing->config, array_filter((array) $request->input('config', []), static fn ($value): bool => is_string($value) && $value !== ''))]);
        }
        $data = $request->validate([
            'name' => ['required', 'string', 'max:64'],
            'type' => ['required', ValidationRule::in(Sender::TYPES)],
        ] + Sender::rules($type));

        $config = array_filter(array_map('strval', $data['config'] ?? []), static fn (string $value): bool => $value !== '');
        $channel = new Channel(['type' => $type, 'config' => $config]);

        if (($target = Sender::target($channel)) !== null && ($problem = Targets::problem($target, $this->settings->allowPrivateTargets())) !== null) {
            abort(422, $problem);
        }

        return ['name' => $data['name'], 'type' => $type, 'config' => $config];
    }

    private function find(Request $request, int $id): Channel
    {
        return Channel::query()->where('user_id', $request->user()->id)->findOrFail($id);
    }

    private function panelName(): string
    {
        return (string) config('app.name', 'Pterodactyl');
    }
}
