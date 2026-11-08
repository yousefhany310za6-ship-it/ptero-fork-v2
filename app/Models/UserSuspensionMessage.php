<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Database\Factories\UserSuspensionMessageFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'suspension_id',
    'message',
    'created_by',
])]
#[RouteKey('id')]
class UserSuspensionMessage extends Model
{
    /** @use HasFactory<UserSuspensionMessageFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'user_suspension_message';

    /** A row here is a quotation. Quotations are not edited, so there is nothing to update. */
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
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
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
