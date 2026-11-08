<?php

declare(strict_types=1);

namespace Monitoring\Support;

/**
 * Averages samples into evenly sized buckets for the charts.
 *
 * @phpstan-type SampleRow array{t: int, state: int, cpu: float, memory: int, disk: int, rx: int, tx: int}
 * @phpstan-type Point array{t: int, cpu: float|null, memory: float|null, disk: float|null, rx: float|null, tx: float|null, up: float|null}
 */
final class Series
{
    /**
     * @param  list<SampleRow>  $samples  Oldest first, `t` in unix seconds.
     * @return list<Point>
     */
    public static function bucket(array $samples, int $from, int $to, int $buckets): array
    {
        $size = max(1, (int) ceil(($to - $from) / $buckets));
        $groups = [];
        $previous = null;

        foreach ($samples as $sample) {
            $index = intdiv($sample['t'] - $from, $size);

            if ($index < 0 || $index >= $buckets) {
                $previous = $sample;

                continue;
            }

            [$rx, $tx] = self::rates($previous, $sample);
            $groups[$index][] = $sample + ['rx_rate' => $rx, 'tx_rate' => $tx];
            $previous = $sample;
        }

        $points = [];

        for ($index = 0; $index < $buckets; $index++) {
            $group = $groups[$index] ?? [];
            $known = array_values(array_filter($group, static fn (array $sample): bool => $sample['state'] !== State::UNREACHABLE));
            $running = array_values(array_filter($known, static fn (array $sample): bool => $sample['state'] === State::RUNNING));

            $points[] = [
                't' => $from + $index * $size,
                'cpu' => self::average($running, 'cpu'),
                'memory' => self::average($running, 'memory'),
                'disk' => self::average($known, 'disk'),
                'rx' => self::average($running, 'rx_rate'),
                'tx' => self::average($running, 'tx_rate'),
                'up' => $known === [] ? null : round(count($running) / count($known), 3),
            ];
        }

        return $points;
    }

    /**
     * Bytes per second since the previous sample. Counters restart with the container, so drops count as zero.
     *
     * @param  SampleRow|null  $previous
     * @param  SampleRow  $sample
     * @return array{0: float|null, 1: float|null}
     */
    private static function rates(?array $previous, array $sample): array
    {
        $seconds = $previous === null ? 0 : $sample['t'] - $previous['t'];

        if ($seconds <= 0) {
            return [null, null];
        }

        return [max(0, $sample['rx'] - $previous['rx']) / $seconds, max(0, $sample['tx'] - $previous['tx']) / $seconds];
    }

    /** @param list<array<string, mixed>> $rows */
    private static function average(array $rows, string $key): ?float
    {
        $values = array_filter(array_column($rows, $key), static fn ($value): bool => $value !== null);

        return $values === [] ? null : round(array_sum($values) / count($values), 2);
    }
}
