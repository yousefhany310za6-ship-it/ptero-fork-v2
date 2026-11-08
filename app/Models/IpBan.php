<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Carbon\CarbonImmutable;
use Database\Factories\IpBanFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Support\Network\IpAddress;

#[Fillable([
    'first_ip',
    'last_ip',
    'cidr_label',
    'reason',
    'expires_at',
    'created_by',
])]
#[RouteKey('id')]
class IpBan extends Model
{
    /** @use HasFactory<IpBanFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'ip_ban';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->where(fn (Builder $q): Builder => $q
            ->whereNull('expires_at')
            ->orWhere('expires_at', '>', CarbonImmutable::now())
        );
    }

    /**
     * The three lists an administrator asks for when a ban table has grown. This is the
     * `filter[status]` query parameter, bound straight to the request by the API, so an
     * unrecognised value is answered as the bad input it is rather than as a server fault.
     *
     * @param  Builder<self>  $query
     */
    public function scopeStatus(Builder $query, string $status): void
    {
        match ($status) {
            'active' => $query->active(),
            'expired' => $query->whereNotNull('expires_at')->where('expires_at', '<=', CarbonImmutable::now()),
            'permanent' => $query->whereNull('expires_at'),
            default => throw ValidationException::withMessages([
                'filter.status' => "Unknown IP ban status [$status].",
            ]),
        };
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * A ban with no end date. The absence of an expiry is the whole definition, so this
     * can never disagree with another column.
     */
    public function isPermanent(): bool
    {
        return $this->expires_at === null;
    }

    public function hasExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * Whether an address falls inside the stored bounds. Byte comparison, in the same
     * normalised space the address was parsed into, so notation is not a way to be a
     * different host.
     */
    public function covers(IpAddress $address): bool
    {
        return $address->within($this->first_ip, $this->last_ip);
    }

    /**
     * What an administrator reads for this row: the CIDR for a range, the bare address for
     * a host ban. `cidr_label` is stored only for ranges — it is the canonical text built
     * from the bounds as they were worked out, so display and enforcement agree by
     * construction rather than by two columns describing one fact.
     */
    public function rangeLabel(): string
    {
        return $this->cidr_label ?? IpAddress::fromBinary($this->first_ip)->label();
    }

    public function isRange(): bool
    {
        return $this->first_ip !== $this->last_ip;
    }
}
