<?php

declare(strict_types=1);

namespace Monitoring\Http;

use Carbon\CarbonImmutable;
use Monitoring\Models\Sample;
use Monitoring\Settings;
use Monitoring\Support\Series;
use Monitoring\Support\State;
use Pterodactyl\Models\Server;

/**
 * Chart data for one server, shared by the server page and the admin server tab.
 */
final readonly class History
{
    public const array RANGES = ['1h' => 3600, '6h' => 21600, '24h' => 86400, '7d' => 604800];

    public function __construct(private Settings $settings) {}

    /** @return array<string, mixed> */
    public function for(Server $server, string $range): array
    {
        $seconds = self::RANGES[$range] ?? self::RANGES['24h'];
        $interval = $this->settings->interval() * 60;
        $to = CarbonImmutable::now()->getTimestamp();
        $from = $to - $seconds;

        $samples = Sample::query()
            ->where('server_id', $server->id)
            ->where('sampled_at', '>=', CarbonImmutable::createFromTimestamp($from - $interval, config('app.timezone')))
            ->orderBy('sampled_at')
            ->get()
            ->map(static fn (Sample $sample): array => [
                't' => $sample->sampled_at->getTimestamp(),
                'state' => $sample->state,
                'cpu' => $sample->cpu,
                'memory' => $sample->memory,
                'disk' => $sample->disk,
                'rx' => $sample->rx,
                'tx' => $sample->tx,
            ])
            ->all();

        $points = Series::bucket($samples, $from, $to, (int) min(120, max(1, intdiv($seconds, $interval))));
        $known = array_filter($points, static fn (array $point): bool => $point['up'] !== null);
        $latest = end($samples) ?: null;

        return [
            'range' => array_search($seconds, self::RANGES, true),
            'interval' => $this->settings->interval(),
            'points' => $points,
            'uptime' => $known === [] ? null : round(array_sum(array_column($known, 'up')) / count($known) * 100, 2),
            'limits' => ['cpu' => $server->cpu, 'memory' => $server->memory, 'disk' => $server->disk],
            'current' => $latest === null ? null : [
                'state' => State::name($latest['state']),
                'cpu' => $latest['cpu'],
                'memory' => $latest['memory'],
                'disk' => $latest['disk'],
                'at' => CarbonImmutable::createFromTimestamp($latest['t'])->toAtomString(),
            ],
        ];
    }
}
