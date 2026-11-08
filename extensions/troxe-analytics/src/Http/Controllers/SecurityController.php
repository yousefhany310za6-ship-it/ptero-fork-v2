<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Support\DataHealth;

/**
 * What the panel recorded about who did what, and what the internet asked this machine for.
 *
 * Both halves are counts of things that were already being written: the panel's own audit log,
 * and its own access log. Nothing here observes a user or a container any more closely than the
 * panel already does — the value analytics adds is that these figures outlive the pruning of
 * the logs they came from.
 *
 * The audit log's `properties` column is never read. It holds whatever the actor typed, which
 * can be a password change request or a server command, and a metrics endpoint has no business
 * carrying it.
 */
final class SecurityController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $range = $this->window->resolve($request);
        $http = $this->history->http($range);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'events' => $this->history->events($range, $this->window->integer($request, 'events', 12, 50)),
            'timeline' => $this->history->timeline($this->window->integer($request, 'timeline', 100, 500)),
            // Scanner traffic is kept out of the panel's own request figures and reported here
            // instead, so an error rate describes the panel rather than the noise around it.
            'probes' => $this->history->probes($range, $this->window->integer($request, 'probes', 50, 200)),
            'panel_errors' => [
                'requests' => $this->readout->total($http, 'requests'),
                'errors_4xx' => $this->readout->total($http, 'errors_4xx'),
                'errors_5xx' => $this->readout->total($http, 'errors_5xx'),
            ],
            'health' => $this->health->banner(),
        ]);
    }
}
