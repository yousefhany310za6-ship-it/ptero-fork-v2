<?php

declare(strict_types=1);

namespace Monitoring\Support;

/**
 * Decides whether a rule is broken by a window of samples.
 *
 * @phpstan-type SampleRow array{state: int, cpu: float, memory: int, disk: int}
 * @phpstan-type Limits array{cpu: int, memory: int, disk: int}
 */
final class Condition
{
    /**
     * Usage in percent of the server's limit. CPU without a limit is compared as absolute usage.
     *
     * @param  SampleRow  $sample
     * @param  Limits  $limits
     */
    public static function percent(string $metric, array $sample, array $limits): ?float
    {
        return match ($metric) {
            'cpu' => $limits['cpu'] > 0 ? $sample['cpu'] / $limits['cpu'] * 100 : $sample['cpu'],
            'memory' => $limits['memory'] > 0 ? $sample['memory'] / $limits['memory'] * 100 : null,
            'disk' => $limits['disk'] > 0 ? $sample['disk'] / $limits['disk'] * 100 : null,
            default => null,
        };
    }

    /**
     * The current and highest value when every sample breaks the rule, otherwise null.
     *
     * @param  list<SampleRow>  $samples  Oldest first.
     * @param  Limits  $limits
     * @return array{value: float, peak: float}|null
     */
    public static function check(string $metric, int $threshold, array $samples, array $limits, int $required): ?array
    {
        if (count($samples) < max(1, $required)) {
            return null;
        }

        if ($metric === 'offline') {
            foreach ($samples as $sample) {
                if ($sample['state'] === State::RUNNING || $sample['state'] === State::UNREACHABLE) {
                    return null;
                }
            }

            return ['value' => 0.0, 'peak' => 0.0];
        }

        $values = [];

        foreach ($samples as $sample) {
            $value = self::percent($metric, $sample, $limits);

            if ($value === null || $value <= $threshold) {
                return null;
            }

            $values[] = $value;
        }

        return ['value' => end($values), 'peak' => max($values)];
    }
}
