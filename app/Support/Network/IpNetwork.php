<?php

declare(strict_types=1);

namespace Pterodactyl\Support\Network;

/**
 * An address range held as the first and last 16-byte addresses it covers. Both bounds
 * live in the same normalised space as IpAddress, so a `/24` written in IPv4 notation
 * matches a client whose socket address arrives in IPv4-mapped IPv6 notation.
 */
final class IpNetwork
{
    public function __construct(
        public readonly IpAddress $address,
        public readonly int $prefix,
        public readonly string $first,
        public readonly string $last,
    ) {}

    public function contains(IpAddress $address): bool
    {
        return $address->within($this->first, $this->last);
    }

    /**
     * The CIDR an administrator typed, rebuilt from the normalised value so that stored
     * and displayed text always agree with what the range actually matches.
     */
    public function label(): string
    {
        $hostBits = $this->address->isIpv4() ? 32 : 128;

        return $this->address->label().'/'.($this->prefix - (128 - $hostBits));
    }

    public function isSingleAddress(): bool
    {
        return $this->first === $this->last;
    }
}
