<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Carbon\CarbonImmutable;
use Database\Factories\UserSuspensionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Enum\SuspensionReason;

/**
 * @property-read UserSuspensionMessage|null $current_message
 */
#[Fillable([
    'user_id',
    'support_case_id',
    'reason',
    'internal_note',
    'expires_at',
    'created_by',
])]
#[RouteKey('id')]
class UserSuspension extends Model
{
    /** @use HasFactory<UserSuspensionFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'user_suspension';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reason' => SuspensionReason::class,
            'expires_at' => 'datetime',
            'lifted_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * The suspensions that have not been lifted. This is the whole of what enforcement
     * could care about: `users.account_status` is what a request path reads, and a lifted
     * row is history regardless of the expiry it carried.
     *
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('lifted_at');
    }

    /**
     * The three lists an administrator asks for when suspensions pile up. Bound straight to
     * `filter[status]`, so an unrecognised value is answered as the bad input it is rather
     * than as a server fault.
     *
     * @param  Builder<self>  $query
     */
    public function scopeStatus(Builder $query, string $status): void
    {
        match ($status) {
            // Lifted or not: while a row is unlifted the account is blocked, even if the
            // moment it named has passed, because lifting on expiry is a setting and not a
            // law. `expired` is the list of suspensions whose moment has gone by.
            'active' => $query->active(),
            'expired' => $query->active()->whereNotNull('expires_at')->where('expires_at', '<=', CarbonImmutable::now()),
            'lifted' => $query->whereNotNull('lifted_at'),
            default => throw ValidationException::withMessages([
                'filter.status' => "Unknown suspension status [$status].",
            ]),
        };
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Every version of the message, oldest first. Version one is what was issued; a
     * correction appends rather than edits, which is the only way the original survives.
     *
     * @return HasMany<UserSuspensionMessage, $this>
     */
    public function messages(): HasMany
    {
        return $this->hasMany(UserSuspensionMessage::class, 'suspension_id')->orderBy('id');
    }

    /**
     * @return HasMany<UserSuspensionServer, $this>
     */
    public function servers(): HasMany
    {
        return $this->hasMany(UserSuspensionServer::class, 'suspension_id')->orderBy('server_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function lifter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'lifted_by');
    }

    /** A suspension with no end date is one an administrator has to lift. */
    public function isPermanent(): bool
    {
        return $this->expires_at === null;
    }

    public function isLifted(): bool
    {
        return $this->lifted_at !== null;
    }

    /**
     * Whether the moment this suspension named has passed without it being lifted — the
     * state automatic lifting was switched on to end.
     */
    public function isAwaitingExpiryLift(): bool
    {
        return ! $this->isLifted()
            && $this->expires_at !== null
            && $this->expires_at->lessThanOrEqualTo(CarbonImmutable::now());
    }

    /**
     * The message an account holder is shown now: the newest version, or null in the
     * impossible case of a suspension with no message row at all.
     *
     * @return Attribute<UserSuspensionMessage|null, never>
     */
    protected function currentMessage(): Attribute
    {
        return Attribute::get(fn (): ?UserSuspensionMessage => $this->messages->last());
    }
}
