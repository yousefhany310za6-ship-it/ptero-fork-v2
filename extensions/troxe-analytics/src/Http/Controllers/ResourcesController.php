<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * What was sold against what was used — the question a hosting operation is actually run on.
 *
 * The panel knows the limits (they are its own records) and analytics knows the usage (they are
 * stored samples), so this page joins them. Each server's mean usage is expressed as a fraction
 * of the limit it was sold, and servers whose limit is zero or missing are left out of the
 * distribution rather than counted as fully used.
 *
 * Nothing here is measured live beyond one read of this machine's own `/proc`, which costs
 * microseconds and no I/O.
 */
final class ResourcesController
{
    /** The bands of the usage distribution, as an upper edge in percent of the sold limit. */
    private const array BANDS = [25, 50, 75, 90, 100];

    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly PanelSource $panels,
        private readonly MonitoringSource $monitoring,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $nodeId = $this->window->node($request);
        $range = $this->window->resolve($request, $nodeId);
        $utilisation = $this->history->utilisation($range, $this->window->integer($request, 'limit', 200, 1000));

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'servers' => $utilisation,
            'distribution' => [
                'cpu' => $this->bands($utilisation, 'cpu', 'cpu_limit'),
                'memory' => $this->bands($utilisation, 'memory', 'memory_limit'),
                'disk' => $this->bands($utilisation, 'disk', 'disk_limit'),
            ],
            'totals' => $this->panels->census(),
            'nodes' => $this->readout->nodes(),
            'host' => $this->monitoring->panelHost(),
            'health' => $this->health->banner(),
        ]);
    }

    /**
     * How many servers sit in each band of their own limit. A percentage is only meaningful
     * against a limit that exists, so a server sold no limit for that resource is counted as
     * unknown rather than as fully used.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<array{band: string, servers: int}>
     */
    private function bands(array $rows, string $usage, string $limit): array
    {
        $counts = array_fill_keys(self::BANDS, 0);
        $counts['unknown'] = 0;
        $counts['over'] = 0;

        foreach ($rows as $row) {
            $ceiling = (float) ($row[$limit] ?? 0);

            if ($ceiling <= 0) {
                $counts['unknown']++;

                continue;
            }

            $percent = (float) ($row[$usage] ?? 0) / $ceiling * 100;

            foreach (self::BANDS as $edge) {
                if ($percent <= $edge) {
                    $counts[$edge]++;

                    continue 2;
                }
            }

            $counts['over']++;
        }

        $out = [['band' => 'no limit recorded', 'servers' => $counts['unknown']]];
        $from = 0;

        foreach (self::BANDS as $edge) {
            $out[] = ['band' => $from.'–'.$edge.'%', 'servers' => $counts[$edge]];
            $from = $edge;
        }

        $out[] = ['band' => 'over '.$from.'%', 'servers' => $counts['over']];

        return $out;
    }
}
