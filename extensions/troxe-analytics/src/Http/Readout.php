<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http;

use TroxeAnalytics\Sources\PanelSource;

/**
 * Views that need more than one source, so no controller has to hold the same joins twice.
 *
 * A node list is the clearest case: what the node *is* comes from the panel's own `nodes`
 * table, what was *sold* to it comes from the servers it hosts, and what it *looked like* last
 * comes from this extension's stored history. Those are three reads with three different
 * lifetimes, and a node analytics has never sampled has to be reported as never sampled rather
 * than as a machine at zero.
 */
final readonly class Readout
{
    public function __construct(private History $history, private PanelSource $panels) {}

    /**
     * Every node the panel defines, with its allocation and the last thing stored about it.
     *
     * @return list<array<string, mixed>>
     */
    public function nodes(): array
    {
        $latest = $this->history->latestNodes();
        $allocated = $this->panels->allocations();
        $out = [];

        foreach ($this->panels->nodes() as $id => $node) {
            $seen = $latest[$id] ?? [];
            $sold = $allocated[$id] ?? ['servers' => 0, 'cpu' => 0, 'memory' => 0, 'disk' => 0];

            $out[] = [
                'id' => $id,
                'name' => $node['name'],
                'fqdn' => $node['fqdn'],
                'maintenance' => $node['maintenance'],
                // The machine's own size and the sum of what has been sold to it are different
                // numbers, and an overcommit is legitimate, so both are shown.
                'memory_total' => $node['memory_total'],
                'disk_total' => $node['disk_total'],
                'servers' => $sold['servers'],
                'cpu_allocated' => $sold['cpu'],
                'memory_allocated' => $sold['memory'],
                'disk_allocated' => $sold['disk'],
                'cpu' => $this->number($seen, 'cpu_pct'),
                'load1' => $this->number($seen, 'load1'),
                'memory_used' => $this->number($seen, 'memory_used'),
                'disk_used' => $this->number($seen, 'disk_used'),
                'running' => $this->number($seen, 'running'),
                'reachable' => isset($seen['reachable']) ? (bool) $seen['reachable'] : null,
                'sampled_at' => $seen['bucket'] ?? null,
            ];
        }

        return $out;
    }

    /**
     * The window as one figure per line, weighted the way the SQL that produced the points is
     * weighted: a bucket with three samples counts for three, not for one.
     *
     * A mean is only taken over the buckets that have a number at all. A node whose usage is
     * not measurable has null in every bucket, and averaging that into a zero would report a
     * machine doing nothing rather than a machine nobody asked.
     *
     * @param  list<array<string, mixed>>  $points
     * @return array<string, float|int|null>
     */
    public function aggregate(array $points): array
    {
        $weight = $upWeight = $restarts = $rateBuckets = 0;
        $cpu = $memory = $up = $rx = $tx = 0.0;
        $cpuPeak = $memoryPeak = $disk = null;

        foreach ($points as $point) {
            $count = (int) ($point['samples'] ?? 0);

            if ($count > 0) {
                $weight += $count;
                $cpu += (float) ($point['cpu'] ?? 0) * $count;
                $memory += (float) ($point['memory'] ?? 0) * $count;
            }

            // `up` exists on the rollup tiers only. A raw window knows which minutes were
            // sampled, not which servers were running, so uptime stays unknown there rather
            // than being invented from whatever samples happen to exist.
            if ($count > 0 && isset($point['up'])) {
                $upWeight += $count;
                $up += (float) $point['up'] * $count;
            }

            $cpuPeak = $this->higher($cpuPeak, $point['cpu_peak'] ?? null);
            $memoryPeak = $this->higher($memoryPeak, $point['memory_peak'] ?? null);
            $disk = $this->higher($disk, $point['disk'] ?? null);
            $restarts += (int) ($point['restarts'] ?? 0);

            // Traffic arrives as bytes per second per bucket, so the window's figure is a mean
            // rate rather than a sum: six hours of 1 MB/s is not 21600 MB/s.
            if (isset($point['rx'], $point['tx'])) {
                $rateBuckets++;
                $rx += (float) $point['rx'];
                $tx += (float) $point['tx'];
            }
        }

        return [
            'points' => count($points),
            'samples' => $weight,
            'cpu' => $weight === 0 ? null : round($cpu / $weight, 2),
            'cpu_peak' => $this->scaled($cpuPeak, 2),
            'memory' => $weight === 0 ? null : (int) round($memory / $weight),
            'memory_peak' => $this->scaled($memoryPeak),
            'disk_peak' => $this->scaled($disk),
            'up' => $upWeight === 0 ? null : round($up / $upWeight, 4),
            'restarts' => $restarts,
            'rx' => $rateBuckets === 0 ? null : round($rx / $rateBuckets, 2),
            'tx' => $rateBuckets === 0 ? null : round($tx / $rateBuckets, 2),
        ];
    }

    /**
     * The whole window as one number: requests, errors, bytes. Summing a bucket twice is not
     * possible here, because the tier `Range` chose is read once.
     *
     * @param  list<array<string, mixed>>  $points
     */
    public function total(array $points, string $key): int
    {
        $out = 0;

        foreach ($points as $point) {
            $out += (int) ($point[$key] ?? 0);
        }

        return $out;
    }

    /** @param  array<string, mixed>  $row */
    private function number(array $row, string $key): ?float
    {
        return isset($row[$key]) ? round((float) $row[$key], 2) : null;
    }

    private function higher(?float $current, mixed $value): ?float
    {
        return $value === null ? $current : max($current ?? 0.0, (float) $value);
    }

    /** Keeps an unknown figure unknown, and an integer one an integer. */
    private function scaled(?float $value, int $digits = 0): float|int|null
    {
        return $value === null ? null : ($digits === 0 ? (int) round($value) : round($value, $digits));
    }
}
