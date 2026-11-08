<?php

declare(strict_types=1);

namespace Pterodactyl\Support\Network;

use InvalidArgumentException;
use Stringable;

/**
 * An IP address normalised into a single 16-byte space, so that every spelling of the
 * same host — `1.2.3.4`, `::ffff:1.2.3.4`, `::FFFF:0102:0304` — collapses onto identical
 * bytes. Ban matching compares these bytes, which is what closes the formatting-variant
 * bypass that a textual comparison would leave open.
 *
 * An address is binary data, so its length is probed with `isset` on an offset and its
 * display form is read with `unpack`; a multibyte-aware string helper would count those
 * bytes wrong.
 */
final class IpAddress implements Stringable
{
    /** The first twelve bytes of every IPv4-mapped IPv6 address. */
    public const string IPV4_MAPPED_PREFIX = "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff";

    public const int FAMILY_V4 = 4;

    public const int FAMILY_V6 = 6;

    public function __construct(public readonly string $bytes, public readonly int $family)
    {
        // Exactly sixteen bytes: the byte at offset 15 exists and the byte at offset 16 does not.
        if (! isset($bytes[15]) || isset($bytes[16])) {
            throw new InvalidArgumentException('A normalised address must be exactly 16 bytes.');
        }
    }

    public function __toString(): string
    {
        return $this->label();
    }

    /**
     * Rebuild an address from the bytes of a `varbinary(16)` column. A mapped address is
     * reported as IPv4, because that is the address it denotes.
     */
    public static function fromBinary(string $bytes): self
    {
        $isMapped = str_starts_with($bytes, self::IPV4_MAPPED_PREFIX);

        return new self($bytes, $isMapped ? self::FAMILY_V4 : self::FAMILY_V6);
    }

    public function isIpv4(): bool
    {
        return $this->family === self::FAMILY_V4;
    }

    /**
     * A display form that never prints an IPv4 address in IPv6 notation.
     */
    public function label(): string
    {
        if ($this->isIpv4()) {
            return sprintf(
                '%d.%d.%d.%d',
                ord($this->bytes[12]),
                ord($this->bytes[13]),
                ord($this->bytes[14]),
                ord($this->bytes[15]),
            );
        }

        return (string) inet_ntop($this->bytes);
    }

    public function equals(self $other): bool
    {
        return $this->bytes === $other->bytes;
    }

    /**
     * Whether the address lies inside a range's bounds, both given as normalised bytes.
     * This is the only range comparison in the codebase: a stored ban, a computed network,
     * and a cached row all reach it, so a ban cannot be read as text and missed.
     */
    public function within(string $first, string $last): bool
    {
        return strcmp($first, $this->bytes) <= 0 && strcmp($this->bytes, $last) <= 0;
    }
}
