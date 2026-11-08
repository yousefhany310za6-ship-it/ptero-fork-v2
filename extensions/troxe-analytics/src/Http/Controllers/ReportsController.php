<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Support\Range;

/**
 * A window of stored history as a spreadsheet, for an administrator who has to account for it.
 *
 * An export is a bounded read of rows that already exist — the same aggregate a chart issues,
 * with a ceiling on how many rows leave the database — so it is not the heavy kind of report
 * that is suspended while the machine is busy. Anything heavier than that, a year of every
 * server folded into one document, belongs in a scheduled job rather than in a request.
 */
final class ReportsController
{
    /** What may be exported, and how many rows of it may leave the database at once. */
    private const array KINDS = [
        'servers' => 500,
        'nodes' => 500,
        'http' => 500,
        'routes' => 200,
        'events' => 200,
        'census' => 400,
    ];

    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
    ) {}

    public function __invoke(Request $request): Response
    {
        $kind = $this->window->text($request, 'type') ?? 'servers';
        $range = $this->window->resolve($request, $this->window->node($request));
        $rows = $this->rows($kind, $range, self::KINDS[$kind] ?? self::KINDS['servers']);

        $name = 'troxe-'.$kind.'-'.$range->from->toDateString().'to'.$range->to->toDateString().'.csv';

        return new Response($this->csv($rows), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$name.'"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rows(string $kind, Range $range, int $limit): array
    {
        return match ($kind) {
            // One row per node: its capacity, what has been sold to it, and the last figures
            // stored about it. A node's own history is a chart, not a table, and the chart's
            // data is already exported as `servers` and `http`.
            'nodes' => $this->readout->nodes(),
            'http' => $this->history->http($range),
            'routes' => $this->history->routes($range, $limit),
            'events' => $this->history->events($range, $limit)['totals'],
            'census' => $this->history->census($range->from),
            default => $this->history->servers($range, null, $limit),
        };
    }

    /**
     * One row per record, headed by the columns the first record has. An export of an empty
     * window is still a valid file, because "nothing was stored" is the answer, not an error.
     *
     * @param  list<array<string, mixed>>  $rows
     */
    private function csv(array $rows): string
    {
        if ($rows === []) {
            return "note\r\n\"no rows were stored for this window\"\r\n";
        }

        $head = array_keys($rows[0]);
        $out = fopen('php://temp', 'wb');

        fputcsv($out, $head);

        foreach ($rows as $row) {
            fputcsv($out, array_map(
                static fn (string $key): string => self::escape($row[$key] ?? ''),
                $head,
            ));
        }

        rewind($out);

        return (string) stream_get_contents($out);
    }

    /**
     * A server's name is typed by a customer, and a spreadsheet evaluates a cell that begins
     * with `=`, `+`, `-` or `@`. Prefixing such a value with an apostrophe makes it text again,
     * which is the only defence that survives being opened in somebody's application.
     */
    private static function escape(mixed $value): string
    {
        $text = $value === null ? '' : (string) $value;

        return $text !== '' && str_contains('=+-@', $text[0]) ? "'".$text : $text;
    }
}
