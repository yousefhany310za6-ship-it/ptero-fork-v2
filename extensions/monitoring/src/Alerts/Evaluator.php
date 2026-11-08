<?php

declare(strict_types=1);

namespace Monitoring\Alerts;

use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Monitoring\Collector;
use Monitoring\Models\Alert;
use Monitoring\Models\Rule;
use Monitoring\Models\Sample;
use Monitoring\Settings;
use Monitoring\Support\Condition;
use Pterodactyl\Models\Server;

/**
 * Opens alerts for broken rules and resolves them once things are back to normal.
 */
final readonly class Evaluator
{
    public function __construct(private Settings $settings, private Notifier $notifier) {}

    public function evaluate(): void
    {
        $now = CarbonImmutable::now();

        foreach (Rule::query()->where('enabled', true)->get() as $rule) {
            $rule->metric === 'node' ? $this->nodes($rule, $now) : $this->servers($rule, $now);
        }
    }

    private function servers(Rule $rule, CarbonImmutable $now): void
    {
        $interval = $this->settings->interval();
        $servers = Server::query()->when($rule->server_id, static fn ($query, int $id) => $query->whereKey($id))->get(['id', 'name', 'uuid', 'cpu', 'memory', 'disk']);
        $since = $now->subMinutes(max($rule->minutes, $interval))->subSeconds(30);

        $samples = Sample::query()
            ->whereIn('server_id', $servers->modelKeys())
            ->where('sampled_at', '>=', $since)
            ->orderBy('sampled_at')
            ->get(['server_id', 'state', 'cpu', 'memory', 'disk'])
            ->toBase()
            ->groupBy('server_id');

        $required = max(1, intdiv($rule->minutes, $interval));
        $open = $this->open($rule, 'server_id');

        foreach ($servers as $server) {
            $window = ($samples->get($server->id) ?? collect())
                ->map(static fn (Sample $sample): array => ['state' => $sample->state, 'cpu' => $sample->cpu, 'memory' => $sample->memory, 'disk' => $sample->disk])
                ->take(-$required)
                ->values()
                ->all();

            $result = Condition::check($rule->metric, $rule->threshold, $window, ['cpu' => $server->cpu, 'memory' => $server->memory, 'disk' => $server->disk], $required);
            $this->apply($rule, $open->get($server->id), $result, ['server_id' => $server->id], $now);
        }
    }

    private function nodes(Rule $rule, CarbonImmutable $now): void
    {
        $open = $this->open($rule, 'node_id');

        foreach (Cache::get(Collector::NODES, []) as $node => $status) {
            $down = $status['down_since'] ?? null;
            $result = $down !== null && CarbonImmutable::parse($down)->lte($now->subMinutes($rule->minutes)) ? ['value' => 0.0, 'peak' => 0.0] : null;

            $this->apply($rule, $open->get($node), $result, ['node_id' => $node], $now);
        }
    }

    /**
     * @param  array{value: float, peak: float}|null  $result
     * @param  array<string, int>  $subject
     */
    private function apply(Rule $rule, ?Alert $alert, ?array $result, array $subject, CarbonImmutable $now): void
    {
        if ($result !== null && $alert === null) {
            $alert = Alert::query()->create($subject + ['rule_id' => $rule->id, 'value' => $result['value'], 'peak' => $result['peak'], 'started_at' => $now]);
            $alert->setRelation('rule', $rule);

            if ($this->cooledDown($rule, $subject, $now)) {
                $alert->update(['notified_at' => $now]);
                $this->notifier->opened($alert);
            }
        } elseif ($result !== null) {
            $alert->update(['value' => $result['value'], 'peak' => max($alert->peak, $result['peak'])]);
        } elseif ($alert !== null) {
            $alert->update(['resolved_at' => $now]);
            $alert->setRelation('rule', $rule);

            if ($alert->notified_at !== null) {
                $this->notifier->resolved($alert);
            }
        }
    }

    /** @return Collection<int, Alert> Open alerts of the rule, keyed by server or node. */
    private function open(Rule $rule, string $key): Collection
    {
        return Alert::query()->with(['server', 'node'])->where('rule_id', $rule->id)->whereNull('resolved_at')->get()->toBase()->keyBy($key);
    }

    /** @param array<string, int> $subject */
    private function cooledDown(Rule $rule, array $subject, CarbonImmutable $now): bool
    {
        return ! Alert::query()
            ->where('rule_id', $rule->id)
            ->where($subject)
            ->where('notified_at', '>', $now->subMinutes($rule->cooldown))
            ->exists();
    }
}
