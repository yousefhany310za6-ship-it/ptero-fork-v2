<?php

declare(strict_types=1);

namespace Monitoring\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\User;

/**
 * A place a user wants alerts sent to. The config holds webhook URLs and tokens, so it is encrypted.
 *
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property string $type
 * @property array<string, string> $config
 */
final class Channel extends Model
{
    protected $table = 'ext_monitoring_channels';

    protected $fillable = ['user_id', 'name', 'type', 'config'];

    protected function casts(): array
    {
        return ['config' => 'encrypted:array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
