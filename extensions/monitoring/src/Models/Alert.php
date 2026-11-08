<?php

declare(strict_types=1);

namespace Monitoring\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;

/**
 * @property int $id
 * @property int $rule_id
 * @property int|null $server_id
 * @property int|null $node_id
 * @property float $value
 * @property float $peak
 * @property \Carbon\CarbonImmutable $started_at
 * @property \Carbon\CarbonImmutable|null $resolved_at
 * @property \Carbon\CarbonImmutable|null $acknowledged_at
 * @property int|null $acknowledged_by
 * @property \Carbon\CarbonImmutable|null $notified_at
 * @property Rule $rule
 * @property Server|null $server
 * @property Node|null $node
 */
final class Alert extends Model
{
    public $timestamps = false;

    protected $table = 'ext_monitoring_alerts';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'value' => 'float',
            'peak' => 'float',
            'started_at' => 'immutable_datetime',
            'resolved_at' => 'immutable_datetime',
            'acknowledged_at' => 'immutable_datetime',
            'notified_at' => 'immutable_datetime',
        ];
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(Rule::class);
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class);
    }

    /** @return array<string, mixed> */
    public function present(): array
    {
        return [
            'id' => $this->id,
            'rule' => $this->rule->describe(),
            'metric' => $this->rule->metric,
            'global' => $this->rule->server_id === null,
            'server' => $this->server ? ['name' => $this->server->name, 'identifier' => $this->server->uuidShort] : null,
            'node' => $this->node?->name,
            'value' => round($this->value, 1),
            'peak' => round($this->peak, 1),
            'started_at' => $this->started_at->toAtomString(),
            'resolved_at' => $this->resolved_at?->toAtomString(),
            'acknowledged_at' => $this->acknowledged_at?->toAtomString(),
        ];
    }
}
