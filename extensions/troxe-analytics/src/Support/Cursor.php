<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Carbon\CarbonImmutable;
use DateInterval;
use Throwable;
use TroxeAnalytics\Models\State;

/**
 * Where a collector resumes from.
 *
 * Every pass reads forward from a stored position — a bucket, a log byte offset, an
 * activity log id — which is what makes its cost proportional to new data rather than to
 * the size of the table it reads. A cursor is only written once a bucket is finished, so a
 * pass that is stopped early, crashes or is killed by its deadline repeats at most the work
 * of the bucket it was in, and never skips anything.
 */
final class Cursor
{
    /**
     * The stored time to resume from. The first ever run starts a bounded lookback before
     * the target instead of at the beginning of history, and a cursor that has got ahead of
     * the target — a clock adjustment, a manual edit — is clamped back to it, otherwise the
     * pass would do nothing forever without saying so.
     */
    public static function time(string $key, CarbonImmutable $until, DateInterval $lookback): CarbonImmutable
    {
        $stored = State::read($key);
        $at = $stored === null ? null : self::parse($stored);

        if ($at === null) {
            return $until->sub($lookback);
        }

        return $at->gt($until) ? $until : $at;
    }

    public static function write(string $key, CarbonImmutable $at): void
    {
        State::write($key, $at->toDateTimeString());
    }

    /** @return int[] the stored id, or the given first value when nothing is stored */
    public static function id(string $key, int $default = 0): int
    {
        return State::readInt($key, $default);
    }

    public static function writeId(string $key, int $id): void
    {
        State::write($key, (string) $id);
    }

    private static function parse(string $stored): ?CarbonImmutable
    {
        try {
            return CarbonImmutable::parse($stored);
        } catch (Throwable) {
            return null;
        }
    }
}
