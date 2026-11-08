<?php

declare(strict_types=1);

namespace TroxeAnalytics\Console;

use Illuminate\Console\Command;
use Throwable;
use TroxeAnalytics\Models\State;

/**
 * Shared plumbing for every analytics job.
 *
 * Two things happen here that no individual collector should have to think about. The first
 * is priority: a pass asks the kernel for the lowest CPU niceness it can get, so that an
 * administrator running a collection by hand from a terminal competes with nothing. The
 * schedule wraps these commands in `nice -n 19 ionice -c3` as well, which is what covers
 * disk I/O; doing it in the process too means the guarantee does not depend on how the
 * command happened to be started.
 *
 * The second is reporting. Each pass leaves a short record of what it did and, more
 * importantly, of what stopped it — disabled, under pressure, out of time, a log it could not
 * read. The settings screen reads those records, so "analytics is not collecting" has an
 * answer instead of a blank chart.
 *
 * Only the exception class is recorded, never its message. A database error message repeats
 * the query with its bound values, and those values are other people's servers and addresses.
 */
abstract class AnalyticsCommand extends Command
{
    protected function declareLowPriority(): void
    {
        try {
            if (function_exists('proc_nice')) {
                @proc_nice(19);
            }
        } catch (Throwable) {
            // A kernel that will not grant it is not a reason to skip the collection itself.
        }
    }

    /**
     * Runs one pass, records what it did, and returns the exit status for the caller's
     * `handle()`. `run()` is Laravel's own method name and is not overridable.
     */
    protected function pass(string $job, callable $work): int
    {
        $this->declareLowPriority();
        $started = microtime(true);

        try {
            $result = $work();
            $level = (string) ($result['level'] ?? 'full');
            $stopped = $result['stopped'] ?? null;
            $exit = self::SUCCESS;
        } catch (Throwable $e) {
            $result = [];
            $level = 'unknown';
            $stopped = 'failed:'.class_basename($e);
            $exit = self::FAILURE;
        }

        $seconds = round(microtime(true) - $started, 3);
        unset($result['level'], $result['stopped']);

        $this->record($job, ['at' => (string) now()->toIso8601String(), 'seconds' => $seconds, 'level' => $level, 'stopped' => $stopped] + $result);
        $this->line(sprintf('%s: %s in %.3fs (%s)', $job, json_encode($result, JSON_UNESCAPED_SLASHES), $seconds, $stopped ?? 'complete'));

        return $exit;
    }

    /** @param array<string, mixed> $record */
    private function record(string $job, array $record): void
    {
        $results = State::readJson(State::LAST_RESULTS);
        $results[$job] = $record;

        // Keys are job names this extension defines, and the value is a handful of numbers,
        // so the row stays small forever.
        State::writeJson(State::LAST_RESULTS, $results);
        State::write(State::LAST_PASS, (string) now()->toDateTimeString());
    }
}
