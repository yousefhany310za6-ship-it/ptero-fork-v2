<?php

declare(strict_types=1);

namespace Monitoring\Support;

/**
 * Splits a node's memory or disk into what servers use, what the rest of the machine uses and what is free,
 * and compares what the servers were promised with what the node allows. All sizes are MiB.
 *
 * @phpstan-type Segment array{key: 'servers'|'other'|'free'|'unused', mib: int, percent: float}
 * @phpstan-type Usage array{total: int, host: bool, segments: list<Segment>, allocated: int, allowed: int, overallocate: int, left: int, unlimited: int, warnings: list<'physical'|'low'>}
 */
final class Capacity
{
    /** Less than this share of the allowed amount left to allocate counts as running low. */
    public const float LOW_SHARE = 0.1;

    /**
     * @param  int  $servers  Live usage of all servers on the node.
     * @param  int  $allocated  Sum of the servers' limits.
     * @param  int  $unlimited  Servers without a limit.
     * @param  int  $configured  The node's memory or disk setting.
     * @param  int  $overallocate  The node's overallocation in percent.
     * @param  int|null  $physical  Size the machine reports, when known.
     * @param  array{total: int, used: int}|null  $host  Usage of the whole machine, only when the panel runs on it.
     * @return Usage
     */
    public static function of(int $servers, int $allocated, int $unlimited, int $configured, int $overallocate, ?int $physical = null, ?array $host = null): array
    {
        $total = max(0, $host['total'] ?? $physical ?? $configured);
        $servers = min(max(0, $servers), $total);
        $other = $host === null ? null : min(max(0, $host['used'] - $servers), $total - $servers);
        $rest = $total - $servers - ($other ?? 0);

        $segments = [self::segment('servers', $servers, $total)];

        if ($other !== null) {
            $segments[] = self::segment('other', $other, $total);
        }

        $segments[] = self::segment($other === null ? 'unused' : 'free', $rest, $total);

        $allowed = self::allowed($configured, $overallocate);

        return [
            'total' => $total,
            'host' => $other !== null,
            'segments' => $segments,
            'allocated' => $allocated,
            'allowed' => $allowed,
            'overallocate' => max(0, $overallocate),
            'left' => $allowed - $allocated,
            'unlimited' => $unlimited,
            'warnings' => self::warnings($allocated, $allowed, $total),
        ];
    }

    /**
     * What the panel lets servers allocate in total, the same way the node's utilisation is shown in the panel.
     */
    public static function allowed(int $configured, int $overallocate): int
    {
        return $overallocate > 0 ? (int) round($configured * (1 + $overallocate / 100)) : $configured;
    }

    /**
     * Threads used and promised by servers. CPU limits are percent of one thread, 0 means unlimited.
     *
     * @param  float  $used  Sum of the servers' live CPU in percent.
     * @param  int  $allocated  Sum of the servers' CPU limits in percent.
     * @return array{threads: int|null, used: float, allocated: float, unlimited: int, percent: float|null}
     */
    public static function cpu(float $used, int $allocated, int $unlimited, ?int $threads): array
    {
        $used = round(max(0.0, $used) / 100, 1);

        return [
            'threads' => $threads,
            'used' => $used,
            'allocated' => round(max(0, $allocated) / 100, 1),
            'unlimited' => $unlimited,
            'percent' => $threads > 0 ? round(min(100.0, $used / $threads * 100), 1) : null,
        ];
    }

    /**
     * Servers were promised more than the machine has, or less than a tenth of what the node allows is left.
     *
     * @return list<'physical'|'low'>
     */
    private static function warnings(int $allocated, int $allowed, int $total): array
    {
        $warnings = [];

        if ($allocated > $total) {
            $warnings[] = 'physical';
        }

        if ($allowed - $allocated < $allowed * self::LOW_SHARE) {
            $warnings[] = 'low';
        }

        return $warnings;
    }

    /**
     * @param  'servers'|'other'|'free'|'unused'  $key
     * @return Segment
     */
    private static function segment(string $key, int $mib, int $total): array
    {
        return ['key' => $key, 'mib' => $mib, 'percent' => $total > 0 ? round($mib / $total * 100, 1) : 0.0];
    }
}
