<?php

declare(strict_types=1);

namespace Monitoring\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Server;

/**
 * An Uptime Kuma push monitor that is told every sampling run whether the server is up.
 *
 * @property int $server_id
 * @property string $url
 * @property bool|null $last_up
 * @property string|null $last_error
 * @property \Carbon\CarbonImmutable|null $pushed_at
 */
final class Push extends Model
{
    public $incrementing = false;

    protected $table = 'ext_monitoring_pushes';

    protected $primaryKey = 'server_id';

    protected $fillable = ['server_id', 'url', 'last_up', 'last_error', 'pushed_at'];

    protected function casts(): array
    {
        return ['url' => 'encrypted', 'last_up' => 'boolean', 'pushed_at' => 'immutable_datetime'];
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
