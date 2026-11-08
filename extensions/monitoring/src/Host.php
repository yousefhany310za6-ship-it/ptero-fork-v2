<?php

declare(strict_types=1);

namespace Monitoring;

use Illuminate\Support\Facades\Cache;
use Monitoring\Support\Proc;

/**
 * Facts about the machine the panel runs on. Inside a container, memory, kernel and load are the host's.
 */
final readonly class Host
{
    /** @return array{total: int, available: int}|null Bytes. */
    public function memory(): ?array
    {
        $info = @file_get_contents('/proc/meminfo');

        return $info === false ? null : Proc::memory($info);
    }

    /** @return array{used: int, total: int}|null Bytes, only when the panel's container has a memory limit. */
    public function containerMemory(): ?array
    {
        $limit = @file_get_contents('/sys/fs/cgroup/memory.max');
        $current = @file_get_contents('/sys/fs/cgroup/memory.current');

        return $limit === false || $current === false || mb_trim($limit) === 'max' ? null : ['used' => (int) $current, 'total' => (int) $limit];
    }

    /** @return array{total: int, free: int}|null Bytes. */
    public function disk(string $path): ?array
    {
        $total = @disk_total_space($path);
        $free = @disk_free_space($path);

        return $total > 0 && $free !== false ? ['total' => (int) $total, 'free' => (int) $free] : null;
    }

    public function kernel(): string
    {
        return php_uname('r');
    }

    public function cpus(): ?int
    {
        $info = @file_get_contents('/proc/cpuinfo');

        return $info === false ? null : (mb_substr_count($info, "processor\t") ?: null);
    }

    /** @return list<float>|null */
    public function load(): ?array
    {
        return function_exists('sys_getloadavg') ? (sys_getloadavg() ?: null) : null;
    }

    public function uptime(): ?int
    {
        $uptime = @file_get_contents('/proc/uptime');

        return $uptime === false ? null : (int) (float) $uptime;
    }

    /**
     * Addresses that reach this machine: its own interfaces and, inside a container on a bridge network, the host's side of it.
     *
     * @return list<string>
     */
    public function addresses(): array
    {
        $addresses = [];

        foreach (function_exists('net_get_interfaces') ? (net_get_interfaces() ?: []) : [] as $interface) {
            foreach ($interface['unicast'] ?? [] as $unicast) {
                if (isset($unicast['address'])) {
                    $addresses[] = (string) $unicast['address'];
                }
            }
        }

        $route = $this->inContainer() ? @file_get_contents('/proc/net/route') : false;

        foreach ($route === false ? [] : Proc::gateways($route) as $gateway) {
            if ($this->isVirtual($gateway['interface'])) {
                $addresses[] = $gateway['gateway'];
            }
        }

        return array_values(array_unique($addresses));
    }

    /** @return list<string> */
    public function lookup(string $host): array
    {
        $host = mb_trim($host, '[]');

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        return Cache::remember('ext:monitoring:dns:'.md5($host), 300, static fn (): array => gethostbynamel($host) ?: []);
    }

    private function inContainer(): bool
    {
        return is_file('/.dockerenv') || is_file('/run/.containerenv');
    }

    /** A veth end inside a container links to an interface with another index, a physical one links to itself. */
    private function isVirtual(string $interface): bool
    {
        if (! preg_match('/^[\w.@-]+$/', $interface)) {
            return false;
        }

        $link = @file_get_contents("/sys/class/net/{$interface}/iflink");
        $index = @file_get_contents("/sys/class/net/{$interface}/ifindex");

        return $link !== false && $index !== false && mb_trim($link) !== mb_trim($index);
    }
}
