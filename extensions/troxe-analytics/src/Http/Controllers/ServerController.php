<?php

declare(strict_types=1);

namespace TroxeAnalytics\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use TroxeAnalytics\Http\History;
use TroxeAnalytics\Http\Readout;
use TroxeAnalytics\Http\Window;
use TroxeAnalytics\Sources\IncidentSource;
use TroxeAnalytics\Support\DataHealth;

/**
 * One server's history, with the limits it was sold alongside the usage it actually had.
 *
 * The id comes from the route and is guarded twice: `whereNumber` in the route file means a
 * non-numeric id never reaches this code, and `findOrFail` means an id that is not a server of
 * this panel answers 404 rather than empty. Nothing here is scoped by what the request claimed —
 * the endpoints are administrator-only, and an administrator sees the whole fleet by design.
 */
final class ServerController
{
    public function __construct(
        private readonly Window $window,
        private readonly History $history,
        private readonly Readout $readout,
        private readonly IncidentSource $incidents,
        private readonly DataHealth $health,
    ) {}

    public function __invoke(Request $request, int $id): JsonResponse
    {
        $server = Server::query()
            ->with(['node:id,name', 'user:id,username'])
            ->findOrFail($id);

        $range = $this->window->resolve($request, $server->node_id);
        $points = $this->history->server($server->id, $range);

        return new JsonResponse([
            'server' => [
                'id' => $server->id,
                'name' => $server->name,
                'identifier' => $server->uuidShort,
                'uuid' => $server->uuid,
                'node' => $server->node?->name,
                'node_id' => $server->node_id,
                'account' => $server->user?->username,
                'status' => $server->status,
                // What the server was sold, so a chart of usage can be read against a limit
                // instead of against a guess.
                'memory_limit' => $server->memory,
                'disk_limit' => $server->disk,
                'cpu_limit' => $server->cpu,
                'created_at' => $server->created_at?->toIso8601String(),
            ],
            'range' => $this->window->describe($range),
            'points' => $points,
            'totals' => $this->readout->aggregate($points),
            'incidents' => $this->incidents->recent(20, $server->id),
            'health' => $this->health->banner(),
        ]);
    }
}
