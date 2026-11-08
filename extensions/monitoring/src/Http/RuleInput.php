<?php

declare(strict_types=1);

namespace Monitoring\Http;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule as ValidationRule;
use Monitoring\Models\Channel;
use Monitoring\Models\Rule;

/**
 * Validation and output shared by server and admin rules.
 */
final class RuleInput
{
    /** @return array<string, mixed> */
    public static function validate(Request $request, bool $global): array
    {
        $data = $request->validate([
            'metric' => ['required', ValidationRule::in($global ? Rule::METRICS : array_diff(Rule::METRICS, ['node']))],
            'threshold' => ['required_if:metric,cpu,memory,disk', 'integer', 'min:1', 'max:1000'],
            'minutes' => ['required', 'integer', 'min:0', 'max:1440'],
            'cooldown' => ['required', 'integer', 'min:0', 'max:10080'],
            'enabled' => ['boolean'],
            'channels' => ['present', 'array', 'max:20'],
            'channels.*' => ['integer', ValidationRule::exists('ext_monitoring_channels', 'id')->where('user_id', $request->user()->id)],
        ]);

        return [
            'metric' => $data['metric'],
            'threshold' => in_array($data['metric'], ['cpu', 'memory', 'disk'], true) ? (int) $data['threshold'] : 0,
            'minutes' => $data['minutes'],
            'cooldown' => $data['cooldown'],
            'enabled' => $data['enabled'] ?? true,
            'channels' => array_values(array_unique(array_map(intval(...), $data['channels']))),
            'user_id' => $request->user()->id,
        ];
    }

    /** @return array<string, mixed> */
    public static function present(Rule $rule, int $userId): array
    {
        return [
            'id' => $rule->id,
            'metric' => $rule->metric,
            'threshold' => $rule->threshold,
            'minutes' => $rule->minutes,
            'cooldown' => $rule->cooldown,
            'enabled' => $rule->enabled,
            'channels' => $rule->user_id === $userId ? $rule->channels : [],
            'description' => $rule->describe(),
            'owner' => $rule->user->username,
            'mine' => $rule->user_id === $userId,
        ];
    }

    /** @return list<array{id: int, name: string, type: string}> */
    public static function channels(int $userId): array
    {
        return Channel::query()->where('user_id', $userId)->orderBy('name')->get(['id', 'name', 'type'])->map(static fn (Channel $channel): array => [
            'id' => $channel->id,
            'name' => $channel->name,
            'type' => $channel->type,
        ])->all();
    }
}
