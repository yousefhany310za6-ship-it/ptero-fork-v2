<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Carbon\CarbonImmutable;
use Database\Factories\LoginEventFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;
use LogicException;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Support\Network\IpAddress;
use Pterodactyl\Support\Network\IpAddressNormalizer;

#[Fillable([
    'user_id',
    'user_uuid',
    'username_attempted',
    'ip_address',
    'outcome',
    'reason_code',
    'ip_ban_id',
    'suspension_case_id',
    'user_agent',
    'fingerprint',
])]
#[RouteKey('id')]
class LoginEvent extends Model
{
    /** @use HasFactory<LoginEventFactory> */
    use HasFactory;

    use MassPrunable;

    public const string RESOURCE_NAME = 'login_event';

    /**
     * An attempt is a fact that happened at one moment and is never edited afterwards, so
     * there is nothing for an updated_at column to describe.
     */
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'outcome' => LoginEventOutcome::class,
        ];
    }

    /**
     * @param  Builder<self>  $query
     */
    public function scopeForAddress(Builder $query, IpAddress $address): void
    {
        $query->where('ip_address', $address->bytes);
    }

    /**
     * The `filter[outcome]` query parameter, bound straight to the request by the API, so an
     * unrecognised value is answered as the bad input it is rather than as a server fault.
     *
     * @param  Builder<self>  $query
     */
    public function scopeOutcome(Builder $query, string $outcome): void
    {
        $parsed = LoginEventOutcome::tryFrom($outcome);
        if ($parsed === null) {
            throw ValidationException::withMessages([
                'filter.outcome' => "Unknown sign-in outcome [$outcome].",
            ]);
        }

        $query->where('outcome', $parsed->value);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * The address as it was matched against the ban list. Null when the request carried no
     * attributable address — the same absence the ban middleware refuses on, recorded here
     * so that an unattributable attempt is visible instead of silent.
     */
    public function address(): ?IpAddress
    {
        return IpAddressNormalizer::fromStorage($this->ip_address);
    }

    /**
     * The rows past the retention window. Reading the window from the configuration here,
     * rather than deciding it in the scheduler, is what keeps the schedule and the delete in
     * step with each other: turning retention off is one value, not two.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        $days = (int) config('pterodactyl.security.login_ip_retention_days');
        throw_unless($days > 0, LogicException::class, 'Cannot prune sign-in history: no "login_ip_retention_days" configuration value is set.');

        return static::query()->where('created_at', '<=', CarbonImmutable::now()->subDays($days));
    }
}
