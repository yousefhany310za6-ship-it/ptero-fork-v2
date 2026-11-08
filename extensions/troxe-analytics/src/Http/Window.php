<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http;

use Illuminate\Http\Request;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\Range;

/**
 * Turns what a dashboard asked for into the window and tier the read should actually use.
 *
 * The caller names a window — `7d`, or a `from`/`to` pair — and this works out how many
 * servers the aggregate spans and how far back minute detail still exists, which together
 * decide the tier. That decision belongs here rather than in the interface: a browser that
 * asks for 90 days of per-minute samples is asking for a query that would take longer to
 * answer than the chart is worth reading.
 */
final readonly class Window
{
    public function __construct(
        private PanelSource $panels,
        private MonitoringSource $monitoring,
    ) {}

    public function resolve(Request $request, ?int $nodeId = null): Range
    {
        // An aggregate over the fleet touches every server's rows, so the cost of a window is
        // its length multiplied by how many servers it spans, not its length alone.
        $series = max(1, $this->panels->serverCount($nodeId));

        return Range::resolve(
            $this->text($request, 'range'),
            $this->text($request, 'from'),
            $this->text($request, 'to'),
            $series,
            $this->monitoring->horizonFor($series),
        );
    }

    /**
     * The node filter, or null for the whole fleet. An id that is not a number is not a node,
     * and is treated as absent rather than as a value to search for.
     */
    public function node(Request $request): ?int
    {
        $node = $request->query('node');

        return is_numeric($node) && (int) $node > 0 ? (int) $node : null;
    }

    /**
     * What was decided, so the interface can label the chart with the window it is really
     * showing rather than with what it asked for.
     *
     * @return array<string, mixed>
     */
    public function describe(Range $range): array
    {
        return [
            'label' => $range->label,
            'from' => $range->from->toIso8601String(),
            'to' => $range->to->toIso8601String(),
            'tier' => $range->tier,
            'bucket' => $range->bucketSeconds,
            'seconds' => $range->seconds(),
            'windows' => array_keys(Range::windows()),
        ];
    }

    /**
     * A query parameter used as a number, clamped to what the read can afford. Anything that is
     * not a number is treated as absent, because a dashboard must not fail on a mistyped URL.
     */
    public function integer(Request $request, string $key, int $default, int $max): int
    {
        $value = $request->query($key);

        return is_numeric($value) ? max(1, min($max, (int) $value)) : $default;
    }

    /** A query parameter used as a word, or null when it is not one. */
    public function text(Request $request, string $key): ?string
    {
        $value = $request->query($key);

        return is_string($value) && $value !== '' ? $value : null;
    }
}
