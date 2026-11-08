<?php

declare(strict_types=1);

namespace Monitoring\Panel;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Daemon\DaemonConnection;
use Pterodactyl\Services\Helpers\SoftwareVersionService;

/**
 * The only place this extension touches Panel internals.
 */
final readonly class Panel
{
    public function __construct(private SoftwareVersionService $versions) {}

    /**
     * Live state of every server on a node, from one Wings request.
     *
     * @return array<string, array{state: string, cpu: float, memory: int, disk: int, rx: int, tx: int}> Keyed by server UUID.
     */
    public function serverStates(Node $node): array
    {
        $states = [];

        foreach (DaemonConnection::forNode($node)->request('GET', '/api/servers', ['timeout' => 10])->json() ?? [] as $server) {
            $usage = $server['utilization'] ?? [];
            $uuid = $server['configuration']['uuid'] ?? null;

            if (is_string($uuid)) {
                $states[$uuid] = [
                    'state' => (string) ($server['state'] ?? 'offline'),
                    'cpu' => (float) ($usage['cpu_absolute'] ?? 0),
                    'memory' => (int) ($usage['memory_bytes'] ?? 0),
                    'disk' => (int) ($usage['disk_bytes'] ?? 0),
                    'rx' => (int) ($usage['network']['rx_bytes'] ?? 0),
                    'tx' => (int) ($usage['network']['tx_bytes'] ?? 0),
                ];
            }
        }

        return $states;
    }

    /** @return array<string, mixed> */
    public function systemInformation(int $nodeId): array
    {
        return Cache::remember("ext:monitoring:system:{$nodeId}", 60, static fn (): array => Daemon::node(Node::query()->findOrFail($nodeId))->systemInformation(2));
    }

    /**
     * Every node with the settings its capacity is compared against. Memory and disk are MiB.
     *
     * @return list<array{id: int, name: string, fqdn: string, memory: int, memory_overallocate: int, disk: int, disk_overallocate: int, data_directory: string}>
     */
    public function nodes(): array
    {
        return Node::query()->orderBy('name')->get()->map(static fn (Node $node): array => [
            'id' => $node->id,
            'name' => $node->name,
            'fqdn' => $node->fqdn,
            'memory' => $node->memory,
            'memory_overallocate' => $node->memory_overallocate,
            'disk' => $node->disk,
            'disk_overallocate' => $node->disk_overallocate,
            'data_directory' => $node->daemonBase,
        ])->values()->all();
    }

    /**
     * Limits of every server, grouped by node ID. Memory and disk are MiB, CPU percent of a thread, 0 means unlimited.
     *
     * @return array<int, list<array{id: int, memory: int, disk: int, cpu: int}>>
     */
    public function serverLimits(): array
    {
        $limits = [];

        foreach (Server::query()->toBase()->get(['id', 'node_id', 'memory', 'disk', 'cpu']) as $server) {
            $limits[(int) $server->node_id][] = ['id' => (int) $server->id, 'memory' => (int) $server->memory, 'disk' => (int) $server->disk, 'cpu' => (int) $server->cpu];
        }

        return $limits;
    }

    public function serverCount(): int
    {
        return Server::query()->count();
    }

    public function nodeCount(): int
    {
        return Node::query()->count();
    }

    public function latestWings(): string
    {
        return $this->versions->getDaemon();
    }

    public function version(): string
    {
        return (string) config('app.version');
    }
}
