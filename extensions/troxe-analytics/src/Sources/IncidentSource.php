<?php

declare(strict_types=1);

namespace TroxeAnalytics\Sources;

use Closure;
use Monitoring\Models\Alert;
use Monitoring\Models\Rule;
use Throwable;

/**
 * Incidents, read from the monitoring extension rather than reimplemented here.
 *
 * Monitoring already evaluates thresholds, opens and resolves alerts and knows how to tell
 * somebody about them. A second alerting system in this extension would mean two sets of rules
 * that can disagree, two histories of the same event and twice the work on the same samples —
 * so analytics shows what monitoring found and links to the screen where it is configured.
 *
 * Everything is read through monitoring's own models, because their `present()` is what the
 * administrator already sees; a rule's channels are deliberately not included, since a channel
 * carries a webhook address that belongs to the notification layer, not to a report.
 */
final class IncidentSource
{
    /**
     * Alerts still open, plus the ones that closed inside the last day — optionally only the
     * ones about one server or one node, which is what a detail page asks for.
     *
     * @return list<array<string, mixed>>
     */
    public function recent(int $limit = 100, ?int $serverId = null, ?int $nodeId = null): array
    {
        return $this->attempt(static fn (): array => Alert::query()
            ->with(['rule', 'server:id,name,uuidShort', 'node:id,name'])
            ->where(static fn ($query) => $query->whereNull('resolved_at')->orWhere('started_at', '>=', now()->subDay()))
            ->when($serverId !== null, static fn ($query) => $query->where('server_id', $serverId))
            ->when($nodeId !== null, static fn ($query) => $query->where('node_id', $nodeId))
            ->latest('started_at')
            ->limit(max(1, min(500, $limit)))
            ->get()
            ->map(static fn (Alert $alert): array => $alert->present())
            ->values()
            ->all()) ?? [];
    }

    /** @return array{open: int, resolved: int, servers: int, nodes: int} */
    public function counts(): array
    {
        return $this->attempt(static fn (): array => [
            'open' => Alert::query()->whereNull('resolved_at')->count(),
            'resolved' => Alert::query()->whereNotNull('resolved_at')->where('started_at', '>=', now()->subDay())->count(),
            'servers' => Alert::query()->whereNull('resolved_at')->whereNotNull('server_id')->distinct('server_id')->count('server_id'),
            'nodes' => Alert::query()->whereNull('resolved_at')->whereNotNull('node_id')->distinct('node_id')->count('node_id'),
        ]) ?? ['open' => 0, 'resolved' => 0, 'servers' => 0, 'nodes' => 0];
    }

    /**
     * The rules that are in force, so a chart and its thresholds can be read together. Only
     * the global ones: a per-server rule belongs to the server's owner, and this is a fleet
     * view.
     *
     * @return list<array<string, mixed>>
     */
    public function rules(): array
    {
        return $this->attempt(static fn (): array => Rule::query()
            ->whereNull('server_id')
            ->orderBy('metric')
            ->get()
            ->map(static fn (Rule $rule): array => [
                'id' => $rule->id,
                'description' => $rule->describe(),
                'metric' => $rule->metric,
                'threshold' => $rule->threshold,
                'minutes' => $rule->minutes,
                'enabled' => $rule->enabled,
            ])
            ->all()) ?? [];
    }

    /**
     * Monitoring's own screen, where an administrator changes a rule or acknowledges an alert.
     * Analytics is read-only by design: the two extensions must not both be able to write the
     * same row.
     */
    public function configuredAt(): string
    {
        return '/admin/monitoring';
    }

    /**
     * Monitoring is a separate extension, and a dashboard that must be honest about missing
     * data cannot be built on the assumption that its tables are there. An unavailable
     * monitoring extension is reported as no incidents, and the settings screen says so.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T|null
     */
    private function attempt(Closure $callback): mixed
    {
        try {
            return $callback();
        } catch (Throwable) {
            return null;
        }
    }
}
