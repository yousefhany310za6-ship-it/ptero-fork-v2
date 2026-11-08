<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\IncidentSource;
use TroxeAnalytics\Sources\PanelSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * One node: its own history, the servers it holds, and what has been promised to them.
 *
 * Only the columns that describe the machine are read from the node record. A node row also
 * holds the bearer token that authenticates the panel to Wings, which is why nothing here
 * serialises the model and why no endpoint in this extension returns one.
 */
final class NodeController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly PanelSource $panels,
        private readonly IncidentSource $incidents,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request, int $id): JsonResponse
    {
        $node = Node::query()->findOrFail($id);
        $range = $this->window->resolve($request, $node->id);
        $sold = $this->panels->allocations()[$node->id] ?? ['servers' => 0, 'cpu' => 0, 'memory' => 0, 'disk' => 0];

        return new JsonResponse([
            'node' => [
                'id' => $node->id,
                'name' => $node->name,
                'fqdn' => $node->fqdn,
                'maintenance' => (bool) $node->maintenance_mode,
                'memory_total' => $node->memory + max(0, (int) $node->memory_overallocate),
                'disk_total' => $node->disk + max(0, (int) $node->disk_overallocate),
                'server_count' => $sold['servers'],
                'cpu_allocated' => $sold['cpu'],
                'memory_allocated' => $sold['memory'],
                'disk_allocated' => $sold['disk'],
            ],
            'range' => $this->window->describe($range),
            'points' => $this->history->node($node->id, $range),
            'servers' => $this->history->servers($range, $node->id, 100),
            'incidents' => $this->incidents->recent(20, null, $node->id),
            'health' => $this->health->banner(),
        ]);
    }
}
