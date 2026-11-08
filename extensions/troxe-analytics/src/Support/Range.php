<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/**
 * Maps a dashboard window onto the cheapest series tier that can honestly draw it.
 *
 * Three things decide the tier: how many rows the read would touch (scaled by how many
 * servers or nodes are in scope, because every aggregate scans them all), whether the
 * tier still exists that far back, and a target of about 200 plotted points. A tier that
 * has been pruned is never offered, so a 30-day chart on short retention falls back to a
 * rollup instead of returning an empty graph.
 */
final readonly class Range
{
    /** Minute samples, which live in the monitoring extension's sample table. */
    public const string RAW = 'raw';

    public const string HOUR = 'hour';

    public const string DAY = 'day';

    /** Rows a single chart read may touch, whatever the tier. */
    public const int ROW_CAP = 100_000;

    /** A custom range needs a ceiling or any window becomes a full-table scan. */
    public const int MAX_DAYS = 400;

    /** @var list<int> */
    private const array STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400];

    /**
     * @param  int  $bucketSeconds  width of one plotted point
     * @param  string  $tier  one of RAW, HOUR, DAY
     */
    public function __construct(
        public CarbonImmutable $from,
        public CarbonImmutable $to,
        public string $tier,
        public int $bucketSeconds,
        public string $label,
    ) {}

    /** @return array<string, int> window label => seconds */
    public static function windows(): array
    {
        return [
            '15m' => 900,
            '1h' => 3600,
            '6h' => 21600,
            '24h' => 86400,
            '7d' => 604800,
            '30d' => 2592000,
            '90d' => 7776000,
        ];
    }

    /**
     * @param  int  $series  how many servers or nodes the aggregate spans
     * @param  int|null  $rawHorizonSeconds  how far back minute samples are still kept
     */
    public static function resolve(?string $label, ?string $from, ?string $to, int $series = 1, ?int $rawHorizonSeconds = null): self
    {
        [$start, $end] = self::window($label, $from, $to);

        // Carbon answers an interval as a float; a bucket width and a row estimate are integers.
        $seconds = (int) max(60, $start->diffInSeconds($end, false));
        $series = max(1, $series);

        $tier = self::DAY;
        $bucket = 86400;

        foreach ([self::RAW => 60, self::HOUR => 3600, self::DAY => 86400] as $candidate => $resolution) {
            if ($candidate === self::RAW && $rawHorizonSeconds !== null && $seconds > $rawHorizonSeconds) {
                continue;
            }

            if (intdiv($seconds, $resolution) * $series <= self::ROW_CAP) {
                $tier = $candidate;
                $bucket = self::step(intdiv($seconds, 200), $resolution);

                break;
            }
        }

        return new self($start, $end, $tier, $bucket, self::labelFor($label));
    }

    /**
     * The smallest friendly bucket that still fits the point target, never finer than the
     * resolution of the tier being read.
     */
    private static function step(int $needed, int $resolution): int
    {
        $needed = max($resolution, $needed);

        foreach (self::STEPS as $step) {
            if ($step >= $needed) {
                return $step;
            }
        }

        return 86400;
    }

    /** @return array{CarbonImmutable, CarbonImmutable} */
    private static function window(?string $label, ?string $from, ?string $to): array
    {
        $windows = self::windows();

        if ($label !== null && $label !== '' && isset($windows[$label])) {
            return [CarbonImmutable::now()->subSeconds($windows[$label]), CarbonImmutable::now()];
        }

        if ($from === null || $to === null || $from === '' || $to === '') {
            return [CarbonImmutable::now()->subSeconds($windows['24h']), CarbonImmutable::now()];
        }

        $start = self::instant($from);
        $end = self::instant($to);

        abort_unless($start->lt($end), 422, 'The start of the range must be before its end.');
        abort_unless($end->diffInDays($start) <= self::MAX_DAYS, 422, sprintf('A custom range may cover at most %d days.', self::MAX_DAYS));

        return [$start, $end];
    }

    private static function instant(string $value): CarbonImmutable
    {
        try {
            return CarbonImmutable::parse($value);
        } catch (InvalidArgumentException) {
            abort(422, sprintf('"%s" is not a date or time this panel can read.', $value));
        }
    }

    private static function labelFor(?string $label): string
    {
        return $label === null || $label === '' ? 'custom' : $label;
    }

    /** Seconds covered by the resolved window. */
    public function seconds(): int
    {
        return (int) max(60, $this->from->diffInSeconds($this->to, false));
    }

    /**
     * Timestamp of the bucket a moment falls into, aligned to a whole bucket from the
     * epoch so buckets agree across servers and timezones.
     */
    public function floor(CarbonImmutable $at): CarbonImmutable
    {
        return $at->setTimestamp(intdiv($at->getTimestamp(), $this->bucketSeconds) * $this->bucketSeconds);
    }
}
