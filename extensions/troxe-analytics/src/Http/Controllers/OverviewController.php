<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\IncidentSource;
use TroxeAnalytics\Sources\MonitoringSource;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * The fleet on one screen: what is running now, what it used over the window, and whether the
 * numbers behind it are being collected.
 *
 * `live` is the only figure on this page that is not history — it is the count the monitoring
 * extension holds from its most recent pass, and it can be null when monitoring has never run.
 * Everything else is read from stored rollups, which is what keeps this request cheap no matter
 * how many servers the panel has.
 */
final class OverviewController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly PanelSource $panels,
        private readonly MonitoringSource $monitoring,
        private readonly IncidentSource $incidents,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $nodeId = $this->window->node($request);
        $range = $this->window->resolve($request, $nodeId);

        $fleet = $this->history->fleet($range, $nodeId);
        $http = $this->history->http($range);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'live' => $this->monitoring->headline(),
            'fleet' => ['points' => $fleet, 'totals' => $this->readout->aggregate($fleet)],
            'busiest' => $this->history->servers($range, $nodeId, 10),
            'nodes' => $this->readout->nodes(),
            'census' => $this->panels->census(),
            'http' => [
                'points' => $http,
                'requests' => $this->readout->total($http, 'requests'),
                'errors_4xx' => $this->readout->total($http, 'errors_4xx'),
                'errors_5xx' => $this->readout->total($http, 'errors_5xx'),
            ],
            'events' => $this->history->events($range, 6),
            'incidents' => $this->incidents->counts(),
            'health' => $this->health->banner(),
        ]);
    }
}
