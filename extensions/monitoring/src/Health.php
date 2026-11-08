<?php

declare(strict_types=1);

namespace Monitoring;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;
use Monitoring\Jobs\Heartbeat;
use Monitoring\Models\Alert;
use Monitoring\Models\Sample;
use Monitoring\Panel\Panel;
use Monitoring\Support\Capacity;
use Monitoring\Support\Machine;
use Monitoring\Support\State;
use Monitoring\Support\Versions;
use Throwable;

/**
 * Everything the admin Monitoring page and the overview widget show.
 */
final readonly class Health
{
    private const int MIB = 1048576;

    public function __construct(private Panel $panel, private Settings $settings, private Host $host) {}

    /**
     * Headline numbers and each node's capacity, for the overview widget.
     *
     * @return array<string, mixed>
     */
    public function summary(): array
    {
        return $this->headline() + [
            'capacity' => array_map(static fn (array $node): array => Arr::only($node, ['id', 'name', 'reachable', 'panel_host', 'memory', 'disk']), $this->nodes()),
        ];
    }

    /** @return array<string, mixed> */
    public function details(): array
    {
        return $this->headline() + [
            'interval' => $this->settings->interval(),
            'queues' => collect(['high', 'standard', 'low'])->mapWithKeys(fn (string $queue): array => [$queue => $this->attempt(static fn () => Queue::size($queue))])->all(),
            'versions' => ['panel' => $this->panel->version(), 'php' => PHP_VERSION, 'redis' => $this->redisVersion()] + $this->databaseVersion(),
            'host' => $this->hostDetails(),
            'node_list' => $this->nodes(),
        ];
    }

    /** @return array<string, mixed> */
    private function headline(): array
    {
        $latest = $this->latestSamples();
        $nodes = Cache::get(Collector::NODES, []);

        return [
            'servers' => ['running' => $latest->where('state', State::RUNNING)->count(), 'total' => $this->panel->serverCount()],
            'nodes' => ['reachable' => count(array_filter($nodes, static fn (array $node): bool => $node['reachable'])), 'total' => $this->panel->nodeCount()],
            'alerts' => Alert::query()->whereNull('resolved_at')->count(),
            'scheduler' => $this->freshness(Cache::get(Collector::COLLECTED_AT), $this->settings->interval() * 2 + 1),
            'queue' => $this->freshness(Cache::get(Heartbeat::KEY), $this->settings->interval() * 2 + 2),
            'failed_jobs' => DB::table('failed_jobs')->count(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function nodes(): array
    {
        $status = Cache::get(Collector::NODES, []);
        $latest = $this->latestSamples()->keyBy('server_id');
        $limits = $this->panel->serverLimits();
        $wings = $this->attempt(fn () => $this->panel->latestWings());
        $nodes = $this->panel->nodes();
        $systems = [];

        foreach ($nodes as $node) {
            $systems[$node['id']] = ($status[$node['id']]['reachable'] ?? true) ? $this->attempt(fn () => $this->panel->systemInformation($node['id'])) : null;
        }

        $panelNodes = $this->panelNodes($nodes, $systems);

        return array_map(function (array $node) use ($status, $latest, $limits, $wings, $systems, $panelNodes): array {
            $system = $systems[$node['id']];
            $servers = collect($limits[$node['id']] ?? []);
            $samples = $servers->map(static fn (array $server) => $latest->get($server['id']))->filter();
            $onPanel = in_array($node['id'], $panelNodes, true);
            $memoryBytes = $system['system']['memory_bytes'] ?? null;

            return [
                'id' => $node['id'],
                'name' => $node['name'],
                'reachable' => $status[$node['id']]['reachable'] ?? null,
                'error' => $status[$node['id']]['error'] ?? null,
                'down_since' => $status[$node['id']]['down_since'] ?? null,
                'version' => $system['version'] ?? null,
                'latest' => $wings,
                'os' => $system['system']['os'] ?? null,
                'cpu_threads' => $system['system']['cpu_threads'] ?? null,
                'containers' => $system['docker']['containers'] ?? null,
                'servers' => ['running' => $samples->where('state', State::RUNNING)->count(), 'total' => $servers->count()],
                'panel_host' => $onPanel,
                'memory' => Capacity::of(
                    (int) $samples->sum('memory'),
                    (int) $servers->sum('memory'),
                    $servers->where('memory', 0)->count(),
                    $node['memory'],
                    $node['memory_overallocate'],
                    is_numeric($memoryBytes) ? intdiv((int) $memoryBytes, self::MIB) : null,
                    $onPanel ? $this->hostMemory() : null,
                ),
                'disk' => Capacity::of(
                    (int) $samples->sum('disk'),
                    (int) $servers->sum('disk'),
                    $servers->where('disk', 0)->count(),
                    $node['disk'],
                    $node['disk_overallocate'],
                    null,
                    $onPanel ? $this->hostDisk($node['data_directory'], $node['disk']) : null,
                ),
                'cpu' => Capacity::cpu((float) $samples->sum('cpu'), (int) $servers->sum('cpu'), $servers->where('cpu', 0)->count(), is_numeric($system['system']['cpu_threads'] ?? null) ? (int) $system['system']['cpu_threads'] : null),
            ];
        }, $nodes);
    }

    /**
     * IDs of the nodes on the panel's own machine. Addresses are only looked up when several nodes have its hardware.
     *
     * @param  list<array{id: int, fqdn: string}>  $nodes
     * @param  array<int, array<string, mixed>|null>  $systems
     * @return list<int>
     */
    private function panelNodes(array $nodes, array $systems): array
    {
        $memory = $this->host->memory();
        $panel = ['memory' => $memory['total'] ?? null, 'kernel' => $this->host->kernel(), 'threads' => $this->host->cpus()];
        $sameHardware = [];

        foreach ($nodes as $node) {
            $system = $systems[$node['id']]['system'] ?? [];
            $wings = [
                'memory' => is_numeric($system['memory_bytes'] ?? null) ? (int) $system['memory_bytes'] : null,
                'kernel' => is_string($system['kernel_version'] ?? null) ? $system['kernel_version'] : null,
                'threads' => is_numeric($system['cpu_threads'] ?? null) ? (int) $system['cpu_threads'] : null,
            ];

            if (Machine::sameHardware($wings, $panel)) {
                $sameHardware[] = $node['id'];
            }
        }

        if (count($sameHardware) <= 1) {
            return $sameHardware;
        }

        $addresses = $this->host->addresses();
        $fqdns = array_column($nodes, 'fqdn', 'id');
        $pointingHere = array_values(array_filter($sameHardware, fn (int $id): bool => Machine::pointsHere($this->attempt(fn () => $this->host->lookup($fqdns[$id])) ?? [], $addresses)));

        return Machine::panelNodes($sameHardware, $pointingHere);
    }

    /** @return array{total: int, used: int}|null MiB. */
    private function hostMemory(): ?array
    {
        $memory = $this->host->memory();

        return $memory === null ? null : ['total' => intdiv($memory['total'], self::MIB), 'used' => intdiv($memory['total'] - $memory['available'], self::MIB)];
    }

    /** @return array{total: int, used: int}|null MiB, null when the panel cannot see the node's disk. */
    private function hostDisk(string $dataDirectory, int $configured): ?array
    {
        $visible = $dataDirectory !== '' && @is_dir($dataDirectory);
        $disk = $this->host->disk($visible ? $dataDirectory : storage_path());

        if ($disk === null || ! Machine::sameDisk($visible, intdiv($disk['total'], self::MIB), $configured)) {
            return null;
        }

        return ['total' => intdiv($disk['total'], self::MIB), 'used' => intdiv($disk['total'] - $disk['free'], self::MIB)];
    }

    /** @return array<string, mixed> */
    private function hostDetails(): array
    {
        $container = $this->host->containerMemory();
        $memory = $this->host->memory();
        $disk = $this->host->disk(storage_path());

        return [
            'load' => $this->host->load(),
            'cpus' => $this->host->cpus(),
            'memory' => $container !== null
                ? $container + ['container' => true]
                : ($memory === null ? null : ['used' => $memory['total'] - $memory['available'], 'total' => $memory['total'], 'container' => false]),
            'disk' => ['total' => $disk['total'] ?? null, 'free' => $disk['free'] ?? null],
            'uptime' => $this->host->uptime(),
        ];
    }

    /** @return array{database: string|null, database_full: string|null} */
    private function databaseVersion(): array
    {
        $version = $this->attempt(static fn () => DB::scalar('select version()'));

        if (! is_string($version) || $version === '') {
            return ['database' => null, 'database_full' => null];
        }

        return ['database' => Versions::database($version, (string) $this->attempt(static fn () => DB::connection()->getDriverName())), 'database_full' => $version];
    }

    private function redisVersion(): ?string
    {
        return $this->attempt(static function (): ?string {
            $info = Redis::connection()->command('info', ['server']);

            return $info['redis_version'] ?? $info['Server']['redis_version'] ?? null;
        });
    }

    /** @return Collection<int, Sample> */
    private function latestSamples(): Collection
    {
        $at = Cache::get(Collector::COLLECTED_AT);

        return $at === null ? collect() : Sample::query()->where('sampled_at', CarbonImmutable::parse($at))->get()->toBase();
    }

    /** @return array{at: string|null, ok: bool} */
    private function freshness(?string $at, int $minutes): array
    {
        return ['at' => $at, 'ok' => $at !== null && CarbonImmutable::parse($at)->gte(now()->subMinutes($minutes))];
    }

    private function attempt(callable $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable) {
            return null;
        }
    }
}
