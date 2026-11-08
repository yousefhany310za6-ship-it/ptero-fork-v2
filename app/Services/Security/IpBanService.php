<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Security;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\QueryException;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Models\User;
use Pterodactyl\Support\Network\IpAddress;
use Pterodactyl\Support\Network\IpAddressNormalizer;
use Pterodactyl\Support\Network\IpNetwork;

/**
 * Bans at the network layer, and answers the one question the sign-in path asks: does a
 * stored range cover this address.
 *
 * Matching is a byte comparison against the normalised bounds, so every spelling of one
 * host — `203.0.113.7`, `::ffff:203.0.113.7`, `::FFFF:cb00:7107` — is the same subject to
 * a ban. The active ranges sit in the cache rather than in a query, because the check
 * runs before the login throttle: an unauthenticated flood must not be able to turn each
 * packet into a database read.
 */
final class IpBanService
{
    /** Any prefix at or above this length covers at most 65536 hosts and needs no confirmation. */
    public const int MIN_UNCONFIRMED_PREFIX = 112;

    private const string CACHE_KEY = 'security:ip-bans';

    private const int CACHE_TTL_SECONDS = 60;

    public function __construct(private readonly CacheRepository $cache) {}

    /**
     * The id of an active ban covering the address, or null when nothing does. The id is
     * returned instead of a boolean because the sign-in history records which ban refused
     * an attempt; callers that only need the answer test this for null.
     */
    public function match(IpAddress $address): ?int
    {
        $now = CarbonImmutable::now()->getTimestamp();

        foreach ($this->ranges() as $range) {
            // An expiry read from the cached row is honoured the second it passes, without
            // waiting for the cache to be rebuilt.
            if ($range['expires_at'] !== null && $range['expires_at'] <= $now) {
                continue;
            }

            if ($address->within($range['first_ip'], $range['last_ip'])) {
                return $range['id'];
            }
        }

        return null;
    }

    public function isBanned(IpAddress $address): bool
    {
        return $this->match($address) !== null;
    }

    /**
     * Store a ban for a single address or a CIDR range.
     *
     * @throws ValidationException when the range is not a valid address, already banned,
     *                             covers loopback, or is wide enough to need confirming.
     */
    public function ban(string $value, string $reason, ?CarbonImmutable $expiresAt, User $actor, bool $acknowledgeBroad = false): IpBan
    {
        $network = IpAddressNormalizer::network($value);

        if ($network === null) {
            throw ValidationException::withMessages(['ip' => 'The ip field must be a valid IPv4 or IPv6 address, or a CIDR range such as 203.0.113.0/24.']);
        }

        $this->assertBannable($network, $acknowledgeBroad);

        try {
            $ban = IpBan::query()->create([
                'first_ip' => $network->first,
                'last_ip' => $network->last,
                'cidr_label' => $network->isSingleAddress() ? null : $network->label(),
                'reason' => $reason,
                'expires_at' => $expiresAt,
                'created_by' => $actor->id,
            ]);
        } catch (QueryException $exception) {
            // The unique index on the bounds is the arbiter of a duplicate; two administrators
            // banning the same range at once simply find it already exists.
            if (! $this->isDuplicate($exception)) {
                throw $exception;
            }

            throw ValidationException::withMessages(['ip' => 'This address range is already banned.']);
        }

        $this->flush();

        return $ban;
    }

    /**
     * Remove a ban. The row disappears rather than being marked lifted so that the list an
     * administrator reads is exactly the set of ranges still enforced; the audit trail of
     * the action lives in the activity log, which keeps the record once the row is gone.
     */
    public function lift(IpBan $ban): void
    {
        $ban->delete();

        $this->flush();
    }

    /**
     * Drop the cached ranges, so a ban written by one worker is felt by all of them at
     * once instead of at the end of the cache's life.
     */
    public function flush(): void
    {
        $this->cache->forget(self::CACHE_KEY);
    }

    /**
     * @return list<array{id: int, first_ip: string, last_ip: string, expires_at: int|null}>
     */
    private function ranges(): array
    {
        return $this->cache->remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, function (): array {
            return array_values(IpBan::query()
                ->active()
                ->get(['id', 'first_ip', 'last_ip', 'expires_at'])
                ->map(fn (IpBan $ban): array => [
                    'id' => $ban->id,
                    'first_ip' => $ban->first_ip,
                    'last_ip' => $ban->last_ip,
                    'expires_at' => $ban->expires_at?->getTimestamp(),
                ])
                ->all());
        });
    }

    private function assertBannable(IpNetwork $network, bool $acknowledgeBroad): void
    {
        foreach (['127.0.0.1', '::1'] as $loopback) {
            $address = IpAddressNormalizer::parse($loopback);

            if ($address !== null && $network->contains($address)) {
                throw ValidationException::withMessages([
                    'ip' => 'The loopback address cannot be banned. Health checks and the panel\'s own internal requests arrive from it.',
                ]);
            }
        }

        if ($network->prefix < self::MIN_UNCONFIRMED_PREFIX && ! $acknowledgeBroad) {
            throw ValidationException::withMessages([
                'ip' => sprintf(
                    'This range covers more than 65536 hosts, which is wide enough to lock out accounts that have nothing to do with the abuse. Repeat the request with acknowledge_broad to ban it anyway.',
                ),
            ]);
        }
    }

    private function isDuplicate(QueryException $exception): bool
    {
        // 23000 is the integrity-constraint-violated SQL state; 1062 the duplicate-entry
        // error MariaDB and MySQL report inside it.
        return $exception->getCode() === '23000' && ($exception->errorInfo[1] ?? null) === 1062;
    }
}
