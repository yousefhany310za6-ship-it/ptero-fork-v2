<?php

declare(strict_types=1);

namespace Monitoring\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Monitoring\Health;
use Monitoring\Http\History;
use Monitoring\Http\RuleInput;
use Monitoring\Models\Alert;
use Monitoring\Models\Rule;
use Pterodactyl\Models\Server;

final class AdminController
{
    public function __construct(private readonly Health $health, private readonly History $history) {}

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        return new JsonResponse([
            'health' => $this->health->details(),
            'rules' => Rule::query()->with('user:id,username')->whereNull('server_id')->get()->map(static fn (Rule $rule): array => RuleInput::present($rule, $userId)),
            'alerts' => Alert::query()
                ->with(['rule', 'server', 'node'])
                ->where(static fn ($query) => $query->whereNull('resolved_at')->orWhere('started_at', '>=', now()->subDay()))
                ->latest('started_at')
                ->limit(50)
                ->get()
                ->map(static fn (Alert $alert): array => $alert->present()),
            'channels' => RuleInput::channels($userId),
        ]);
    }

    public function summary(): JsonResponse
    {
        return new JsonResponse($this->health->summary());
    }

    public function storeRule(Request $request): JsonResponse
    {
        abort_if(Rule::query()->whereNull('server_id')->count() >= 50, 422, 'There can be up to 50 global rules.');

        Rule::query()->create(RuleInput::validate($request, true));

        return $this->index($request);
    }

    public function updateRule(Request $request, int $id): JsonResponse
    {
        Rule::query()->whereNull('server_id')->findOrFail($id)->update(RuleInput::validate($request, true));

        return $this->index($request);
    }

    public function destroyRule(Request $request, int $id): JsonResponse
    {
        Rule::query()->whereNull('server_id')->findOrFail($id)->delete();

        return $this->index($request);
    }

    public function acknowledge(Request $request, int $id): JsonResponse
    {
        Alert::query()->whereNull('acknowledged_at')->findOrFail($id)->update(['acknowledged_at' => now(), 'acknowledged_by' => $request->user()->id]);

        return $this->index($request);
    }

    public function server(Request $request, int $id): JsonResponse
    {
        return new JsonResponse($this->history->for(Server::query()->findOrFail($id), (string) $request->query('range', '24h')));
    }
}
