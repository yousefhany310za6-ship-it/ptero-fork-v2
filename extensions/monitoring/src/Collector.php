<?php

declare(strict_types=1);

namespace Monitoring;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Monitoring\Models\Sample;
use Monitoring\Panel\Panel;
use Monitoring\Support\State;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * Stores one sample per server, asking each node once.
 */
final readonly class Collector
{
    public const string NODES = 'ext:monitoring:nodes';

    public const string COLLECTED_AT = 'ext:monitoring:collected_at';

    public function __construct(private Panel $panel) {}

    public function collect(): void
    {
        $now = CarbonImmutable::now()->startOfMinute();

        if (Cache::get(self::COLLECTED_AT) === $now->toAtomString()) {
            return;
        }

        $previous = Cache::get(self::NODES, []);
        $nodes = [];
        $rows = [];

        foreach (Node::query()->get() as $node) {
            try {
                $states = $this->panel->serverStates($node);
                $nodes[$node->id] = ['reachable' => true, 'error' => null, 'down_since' => null];
            } catch (Throwable $exception) {
                $states = null;
                $nodes[$node->id] = [
                    'reachable' => false,
                    'error' => mb_substr($exception->getMessage(), 0, 191),
                    'down_since' => $previous[$node->id]['down_since'] ?? $now->toAtomString(),
                ];
            }

            foreach (Server::query()->where('node_id', $node->id)->toBase()->get(['id', 'uuid']) as $server) {
                $state = $states[$server->uuid] ?? null;

                $rows[] = [
                    'server_id' => $server->id,
                    'sampled_at' => $now,
                    'state' => $states === null ? State::UNREACHABLE : State::fromWings($state['state'] ?? 'offline'),
                    'cpu' => round($state['cpu'] ?? 0, 2),
                    'memory' => intdiv($state['memory'] ?? 0, 1048576),
                    'disk' => intdiv($state['disk'] ?? 0, 1048576),
                    'rx' => $state['rx'] ?? 0,
                    'tx' => $state['tx'] ?? 0,
                ];
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            Sample::query()->insert($chunk);
        }

        Cache::forever(self::NODES, $nodes);
        Cache::forever(self::COLLECTED_AT, $now->toAtomString());
    }
}
