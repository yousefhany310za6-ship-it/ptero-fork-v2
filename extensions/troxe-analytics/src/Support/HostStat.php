<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Processor time for the machine the panel runs on, from /proc/stat.
 *
 * Wings does not report node CPU anywhere: /api/system answers with architecture,
 * cpu_count, kernel, os and version only. So the usage figure for a node is measured here,
 * on the condition that this machine is that node. A percentage needs two readings, and the
 * previous one is kept in the cache because the collector is a different process every
 * minute — the first pass after a restart has no baseline and reports nothing rather than a
 * guess.
 */
final class HostStat
{
    private const string KEY = 'ext:analytics:cpustat';

    private const int TTL = 900;

    /**
     * Busy share of all threads since the previous reading, 0 to 100.
     *
     * @return float|null null when the machine does not expose /proc/stat or no baseline exists yet
     */
    public function cpuPercent(): ?float
    {
        $now = $this->tick();

        if ($now === null) {
            return null;
        }

        $previous = Cache::get(self::KEY);
        Cache::put(self::KEY, $now, self::TTL);

        if (! is_array($previous)) {
            return null;
        }

        $deltaTotal = $now['total'] - $previous['total'];
        $deltaIdle = $now['idle'] - $previous['idle'];

        if ($deltaTotal <= 0 || $deltaIdle < 0 || $deltaIdle > $deltaTotal) {
            return null;
        }

        return round((1 - $deltaIdle / $deltaTotal) * 100, 2);
    }

    /**
     * Aggregate jiffies from the first line of /proc/stat: idle plus iowait against the
     * whole. Counters reset with the machine, which is why the caller rejects a negative
     * delta instead of reporting a hundred percent.
     *
     * @return array{total: int, idle: int}|null
     */
    private function tick(): ?array
    {
        $line = @file_get_contents('/proc/stat', false, null, 0, 512);

        if ($line === false || preg_match('~^cpu\s+(.+)$~m', $line, $matches) !== 1) {
            return null;
        }

        $fields = array_map('intval', preg_split('~\s+~', trim($matches[1]), -1, PREG_SPLIT_NO_EMPTY) ?: []);

        if (count($fields) < 5) {
            return null;
        }

        // user nice system idle iowait irq softirq steal guest guest_nice. The last two are
        // already counted inside user and nice, so they are left out of the total.
        $fields = array_slice($fields, 0, 8);
        $idle = $fields[3] + $fields[4];

        return ['total' => array_sum($fields), 'idle' => $idle];
    }
}
