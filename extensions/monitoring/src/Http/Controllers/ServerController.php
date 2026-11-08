<?php

declare(strict_types=1);

namespace Monitoring\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Monitoring\Http\History;
use Monitoring\Http\RuleInput;
use Monitoring\Models\Alert;
use Monitoring\Models\Push;
use Monitoring\Models\Rule;
use Monitoring\Settings;
use Monitoring\Support\Targets;
use Pterodactyl\Models\Server;

final class ServerController
{
    public function __construct(private readonly History $history, private readonly Settings $settings) {}

    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'read');
        $userId = $request->user()->id;
        $push = Push::query()->find($server->id);

        return new JsonResponse([
            'rules' => Rule::query()->with('user:id,username')->where('server_id', $server->id)->get()->map(static fn (Rule $rule): array => RuleInput::present($rule, $userId)),
            'alerts' => Alert::query()
                ->with(['rule', 'server'])
                ->where('server_id', $server->id)
                ->whereHas('rule', static fn ($query) => $query->whereNotNull('server_id'))
                ->latest('started_at')
                ->limit(20)
                ->get()
                ->map(static fn (Alert $alert): array => $alert->present()),
            'channels' => RuleInput::channels($userId),
            'push' => $push === null ? null : [
                'host' => parse_url($push->url, PHP_URL_HOST),
                'last_up' => $push->last_up,
                'last_error' => $push->last_error,
                'pushed_at' => $push->pushed_at?->toAtomString(),
            ],
        ]);
    }

    public function history(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'read');

        return new JsonResponse($this->history->for($server, (string) $request->query('range', '24h')));
    }

    public function storeRule(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'manage');
        abort_if(Rule::query()->where('server_id', $server->id)->count() >= 20, 422, 'A server can have up to 20 rules.');

        Rule::query()->create(RuleInput::validate($request, false) + ['server_id' => $server->id]);

        return $this->index($request, $server);
    }

    public function updateRule(Request $request, Server $server, int $id): JsonResponse
    {
        $this->authorize($request, $server, 'manage');

        Rule::query()->where('server_id', $server->id)->findOrFail($id)->update(RuleInput::validate($request, false));

        return $this->index($request, $server);
    }

    public function destroyRule(Request $request, Server $server, int $id): JsonResponse
    {
        $this->authorize($request, $server, 'manage');

        Rule::query()->where('server_id', $server->id)->findOrFail($id)->delete();

        return $this->index($request, $server);
    }

    public function acknowledge(Request $request, Server $server, int $id): JsonResponse
    {
        $this->authorize($request, $server, 'manage');

        Alert::query()->where('server_id', $server->id)->whereNull('acknowledged_at')->findOrFail($id)->update([
            'acknowledged_at' => now(),
            'acknowledged_by' => $request->user()->id,
        ]);

        return $this->index($request, $server);
    }

    public function updatePush(Request $request, Server $server): JsonResponse
    {
        $this->authorize($request, $server, 'manage');

        $url = $request->validate(['url' => ['nullable', 'url', 'max:500', 'regex:#/api/push/[\w-]+#']])['url'] ?? null;

        if ($url === null) {
            Push::query()->whereKey($server->id)->delete();
        } else {
            $problem = Targets::problem($url, $this->settings->allowPrivateTargets());
            abort_if($problem !== null, 422, $problem ?? '');

            Push::query()->updateOrCreate(['server_id' => $server->id], ['url' => $url, 'last_up' => null, 'last_error' => null, 'pushed_at' => null]);
        }

        return $this->index($request, $server);
    }

    private function authorize(Request $request, Server $server, string $permission): void
    {
        abort_unless((bool) $request->user()?->can("ext.monitoring.{$permission}", $server), 403, 'You do not have permission to do that.');
    }
}
