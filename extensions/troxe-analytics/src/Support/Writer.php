<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Illuminate\Support\Facades\DB;

/**
 * Writes rows whose counters accumulate across passes rather than replace each other.
 *
 * A log-tailing pass and an activity-log pass each cover only what is new since the last
 * run, and two runs can land inside the same hour. Laravel's own upsert would then overwrite
 * the earlier count with the later one, so the buckets a long hour produced would quietly
 * shrink. This adds them instead, in SQL, with the column names taken from the caller's own
 * constant list and every value bound.
 *
 * The insert is one statement per pass, so the row count written is bounded by the number of
 * buckets touched, not by the number of log lines read.
 */
final class Writer
{
    /**
     * @param  list<string>  $columns  every column in a row, identifier order
     * @param  list<string>  $unique  the columns the unique key is made of
     * @param  list<string>  $counters  the columns that should be summed, not replaced
     * @param  list<array<string, mixed>>  $rows
     */
    public function accumulate(string $table, array $columns, array $unique, array $counters, array $rows): int
    {
        if ($rows === []) {
            return 0;
        }

        $tuples = implode(', ', array_fill(0, count($rows), '('.implode(', ', array_fill(0, count($columns), '?')).')'));
        $updates = implode(', ', array_map(
            static fn (string $column): string => "{$column} = {$column} + VALUES({$column})",
            $counters,
        ));

        $bindings = [];

        foreach ($rows as $row) {
            foreach ($columns as $column) {
                $bindings[] = $row[$column] ?? null;
            }
        }

        DB::statement(
            'INSERT INTO '.$table.' ('.implode(', ', $columns).') VALUES '.$tuples
            .' ON DUPLICATE KEY UPDATE '.$updates,
            $bindings,
        );

        // The buckets this pass touched, not MySQL's affected-row count: an inserted-then-
        // updated row is reported by the engine as two, which would make a bucket count
        // depend on how many of them already had a row in them.
        return count($rows);
    }
}
