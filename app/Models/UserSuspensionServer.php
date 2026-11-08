<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Database\Factories\UserSuspensionServerFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Enum\ServerSuspensionOutcome;

#[Fillable([
    'suspension_id',
    'server_id',
    'server_uuid',
    'wings_state_before',
    'outcome',
    'failure',
])]
#[RouteKey('id')]
class UserSuspensionServer extends Model
{
    /** @use HasFactory<UserSuspensionServerFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'user_suspension_server';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'outcome' => ServerSuspensionOutcome::class,
        ];
    }

    /**
     * @return BelongsTo<UserSuspension, $this>
     */
    public function suspension(): BelongsTo
    {
        return $this->belongsTo(UserSuspension::class, 'suspension_id');
    }

    /**
     * The server, if it still exists. A suspension record outlives the server it stopped,
     * which is why `server_uuid` is kept on this row and nothing here is read from the
     * relationship alone.
     *
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }

    /**
     * Whether this attempt still owes the daemon work. A transfer in progress is the only
     * outcome that is genuinely retryable; a refused or unreachable Wings is left for an
     * administrator to see, because repeating it forever would hide the failure.
     */
    public function isDeferred(): bool
    {
        return $this->outcome === ServerSuspensionOutcome::Deferred;
    }
}
