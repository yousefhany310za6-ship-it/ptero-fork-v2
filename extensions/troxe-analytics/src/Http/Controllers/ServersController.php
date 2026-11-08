<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * The servers list: one row per server that has history in the window, ranked by whichever
 * figure the administrator asked to rank by.
 *
 * A server with no samples in the window has no row, because an average over nothing is not
 * zero — it is unknown. The interface is expected to say that the window holds no data rather
 * than to draw a server that looks idle.
 */
final class ServersController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly PanelSource $panels,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $nodeId = $this->window->node($request);
        $range = $this->window->resolve($request, $nodeId);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'servers' => $this->history->servers(
                $range,
                $nodeId,
                $this->window->integer($request, 'limit', 100, 500),
                $this->window->text($request, 'sort') ?? 'cpu',
                $this->window->text($request, 'search'),
            ),
            'nodes' => $this->readout->nodes(),
            'totals' => $this->panels->census(),
            'health' => $this->health->banner(),
        ]);
    }
}
