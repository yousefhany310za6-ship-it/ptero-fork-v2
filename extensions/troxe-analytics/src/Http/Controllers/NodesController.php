<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * Every node, its capacity, what has been sold to it, and the last thing stored about it.
 *
 * Usage columns are null on a node the panel does not run on: Wings reports capacity and reach,
 * not load, so this is the honest shape of the list rather than a missing feature. Allocation is
 * real for every node because it comes from the panel's own records.
 *
 * `live` and `panel_host` come through the monitoring extension's own fleet read, which is
 * cached for a minute and is the same single read its admin screen makes — this endpoint adds no
 * polling of Wings of its own.
 */
final class NodesController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly MonitoringSource $monitoring,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $range = $this->window->resolve($request);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'nodes' => $this->readout->nodes(),
            // The fleet as monitoring sees it right now, next to the history, so a node that is
            // unreachable is visible without waiting for the next rollup.
            'live' => $this->monitoring->headline(),
            'panel_host' => $this->monitoring->panelHost(),
            'fleet' => $this->history->fleet($range),
            'health' => $this->health->banner(),
        ]);
    }
}
