<?php

declare(strict_types=1);

namespace Pterodactyl\Support;

use Illuminate\Http\Request;

/**
 * A one-way grouping key for the client that made a request.
 *
 * The panel records the User-Agent it was given, and an administrator needs to see when the
 * same machine signs in as several accounts. Hashing the client's self-description does that
 * without storing anything readable: two attempts match when their digests do, and the digest
 * says nothing about the browser on its own.
 *
 * It is deliberately not identity. Everything here is a header the client chooses to send, so
 * it is trivially changed by anyone who cares to, and it is only ever used beside an address
 * that was obtained the same way. It corroborates a history list; it does not accuse anyone.
 */
final class ClientFingerprint
{
    /**
     * Client hint headers arrive hyphenated, which is not a legal PHP property name, so they
     * are read by header instead. They are sent by Chromium browsers over HTTPS and by nobody
     * else, which is exactly why they are optional inputs to the digest rather than its core.
     */
    private const array HEADERS = [
        'user-agent',
        'accept-language',
        'accept-encoding',
        'sec-ch-ua-platform',
        'sec-ch-ua-model',
        'sec-ch-ua-mobile',
    ];

    /**
     * The digest, or null when the request described itself with nothing at all. Storing a
     * constant hash of "empty" would group every such client into one apparent machine.
     */
    public static function fromRequest(Request $request): ?string
    {
        $parts = [];
        foreach (self::HEADERS as $header) {
            $value = $request->headers->get($header);
            if (is_string($value) && $value !== '') {
                $parts[] = $header.'='.$value;
            }
        }

        if ($parts === []) {
            return null;
        }

        return hash('sha256', implode("\x00", $parts));
    }
}
