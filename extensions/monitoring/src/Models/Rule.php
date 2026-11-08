<?php

declare(strict_types=1);

namespace Monitoring\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * @property int $id
 * @property int|null $server_id
 * @property int $user_id
 * @property string $metric
 * @property int $threshold
 * @property int $minutes
 * @property int $cooldown
 * @property bool $enabled
 * @property list<int> $channels
 */
final class Rule extends Model
{
    public const array METRICS = ['cpu', 'memory', 'disk', 'offline', 'node'];

    protected $table = 'ext_monitoring_rules';

    protected $fillable = ['server_id', 'user_id', 'metric', 'threshold', 'minutes', 'cooldown', 'enabled', 'channels'];

    protected $attributes = ['enabled' => true];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'channels' => 'array', 'threshold' => 'integer', 'minutes' => 'integer', 'cooldown' => 'integer'];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function describe(): string
    {
        $duration = $this->minutes > 0 ? " for {$this->minutes} min" : '';

        return match ($this->metric) {
            'cpu' => "CPU above {$this->threshold}%{$duration}",
            'memory' => "Memory above {$this->threshold}%{$duration}",
            'disk' => "Disk above {$this->threshold}%{$duration}",
            'offline' => "Offline{$duration}",
            'node' => "Node unreachable{$duration}",
            default => $this->metric,
        };
    }
}
