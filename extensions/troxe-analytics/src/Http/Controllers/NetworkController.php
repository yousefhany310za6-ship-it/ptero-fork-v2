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
 * Movement: what the servers sent and received, and how much of the panel's address space is
 * actually in use.
 *
 * Traffic is derived from the counters the monitoring collector already reads once a minute, so
 * this page costs no additional sampling. Two honest limits come with that: a counter that
 * crosses a container restart is read as the difference between the extremes of the bucket,
 * which under-reads rather than double-counts, and the figures are per-second rates for a chart
 * and totals for a ranking — because a six-hour window of 1 MB/s is not 21600 MB/s.
 *
 * There is no node-level network figure. Wings reports no interface counters, and the panel's
 * own host network is not the same thing as a node's, so nothing is presented as if it were.
 */
final class NetworkController
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
        $limit = $this->window->integer($request, 'limit', 25, 200);

        $fleet = $this->history->fleet($range, $nodeId);

        return new JsonResponse([
            'range' => $this->window->describe($range),
            'points' => $fleet,
            'totals' => $this->readout->aggregate($fleet),
            'talkers' => [
                'rx' => $this->history->servers($range, $nodeId, $limit, 'rx'),
                'tx' => $this->history->servers($range, $nodeId, $limit, 'tx'),
            ],
            'addresses' => $this->addresses(),
            'health' => $this->health->banner(),
        ]);
    }

    /**
     * Addresses the panel holds on each node and how many carry a server. Running out of these
     * is what stops a server being created, which makes it the one network figure the panel can
     * answer exactly rather than estimate.
     *
     * @return list<array<string, int|string>>
     */
    private function addresses(): array
    {
        $used = $this->panels->ipUse();
        $out = [];

        foreach ($this->panels->nodes() as $id => $node) {
            $out[] = [
                'node_id' => $id,
                'name' => $node['name'],
                'total' => $used[$id]['total'] ?? 0,
                'used' => $used[$id]['used'] ?? 0,
            ];
        }

        return $out;
    }
}
