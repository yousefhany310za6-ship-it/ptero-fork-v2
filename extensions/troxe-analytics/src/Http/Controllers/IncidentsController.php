<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\IncidentSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * Incidents the monitoring extension found, read here rather than decided here.
 *
 * Monitoring evaluates the thresholds, opens and resolves the alerts and knows how to notify
 * somebody about them. A second alerting system inside analytics would mean two sets of rules
 * that can disagree about the same sample and two histories of the same event, so this screen
 * shows what monitoring reported and links to where it is configured. Analytics never writes to
 * an alert, a rule or a channel.
 */
final class IncidentsController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
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
            'counts' => $this->incidents->counts(),
            'incidents' => $this->incidents->recent($this->window->integer($request, 'limit', 100, 500)),
            'rules' => $this->incidents->rules(),
            'configured_at' => $this->incidents->configuredAt(),
            // The window an incident sits in, so a threshold breach can be read against what the
            // rest of the fleet and the panel were doing at the same time.
            'context' => [
                'fleet' => $this->readout->aggregate($fleet),
                'requests' => $this->readout->total($http, 'requests'),
                'errors_5xx' => $this->readout->total($http, 'errors_5xx'),
            ],
            'health' => $this->health->banner(),
        ]);
    }
}
