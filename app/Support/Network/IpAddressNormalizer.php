<?php

declare(strict_types=1);

namespace Pterodactyl\Support\Network;

/**
 * Turns address text into the canonical 16-byte form used for storage and matching.
 *
 * Validation is done by `filter_var` and the packing by `inet_pton`, which together accept
 * every legitimate spelling and reject the ones that have historically been used to slip
 * past textual comparisons: leading-zero octets such as `1.2.3.04` and `010.0.0.1` (which
 * some resolvers read as octal), IPv6 zone identifiers such as `fe80::1%eth0`, and
 * out-of-range octets. Behaviour is pinned by tests/Unit/Network/IpAddressNormalizerTest.php.
 *
 * The packed address is binary, so its family is taken from what was validated rather than
 * from measuring the packed length with a string helper.
 */
final class IpAddressNormalizer
{
    /**
     * Parse a single address, with or without an IPv4-mapped IPv6 prefix.
     */
    public static function parse(?string $value): ?IpAddress
    {
        $text = self::unbracket(trim((string) $value));
        if ($text === '' || str_contains($text, '/')) {
            return null;
        }

        $isV4 = filter_var($text, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
        $isV6 = ! $isV4 && filter_var($text, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false;

        if (! $isV4 && ! $isV6) {
            return null;
        }

        $packed = @inet_pton($text);
        if ($packed === false) {
            return null;
        }

        if ($isV4) {
            return new IpAddress(IpAddress::IPV4_MAPPED_PREFIX.$packed, IpAddress::FAMILY_V4);
        }

        return IpAddress::fromBinary($packed);
    }

    /**
     * Parse an address or CIDR range into the bounds a client address is matched against.
     * A bare address becomes a single-host range.
     *
     * The prefix is read in the notation the administrator used: `1.2.3.0/24` and
     * `::ffff:1.2.3.0/24` both mean the same 256 IPv4 hosts. Reading `/24` off an
     * IPv4-mapped address as an IPv6 prefix instead would silently widen a host ban into a
     * ban on a large slice of the IPv4 space.
     */
    public static function network(?string $value): ?IpNetwork
    {
        $text = trim((string) $value);
        if ($text === '') {
            return null;
        }

        $notation = null;
        if (str_contains($text, '/')) {
            [$text, $notation] = explode('/', $text, 2);

            if (! ctype_digit($notation) || isset($notation[4])) {
                return null;
            }
        }

        $parsed = self::parse($text);
        if ($parsed === null) {
            return null;
        }

        // A bare address is one host: the full prefix length for the family it belongs to.
        $bits = $parsed->isIpv4() ? 32 : 128;
        $prefix = $notation === null ? $bits : (int) ltrim($notation, '0');

        if ($prefix > $bits) {
            return null;
        }

        // An IPv4 range keeps its own 0-32 prefix, offset to where IPv4 sits in the space.
        if ($parsed->isIpv4()) {
            $prefix += 96;
        }

        $mask = self::mask($prefix);

        return new IpNetwork($parsed, $prefix, $parsed->bytes & $mask, ($parsed->bytes & $mask) | ~$mask);
    }

    /**
     * Interpret the bytes read back from a `varbinary(16)` column.
     */
    public static function fromStorage(?string $bytes): ?IpAddress
    {
        if ($bytes === null || ! isset($bytes[15]) || isset($bytes[16])) {
            return null;
        }

        return IpAddress::fromBinary($bytes);
    }

    /**
     * Accept the bracketed spelling an address gains when it is written with a port, so an
     * administrator pasting `[2001:db8::1]:443` into a ban field is not told it is invalid.
     */
    private static function unbracket(string $value): string
    {
        return (string) preg_replace('/^\[(.*)\]$/', '$1', $value);
    }

    /**
     * A host mask of the given prefix length, most-significant bit first.
     */
    private static function mask(int $prefix): string
    {
        $fullBytes = intdiv($prefix, 8);
        $remainder = $prefix % 8;

        $mask = str_repeat("\xff", $fullBytes);
        if ($remainder > 0) {
            $mask .= chr(0xFF << (8 - $remainder) & 0xFF);
            $fullBytes++;
        }

        return $mask.str_repeat("\x00", 16 - $fullBytes);
    }
}
