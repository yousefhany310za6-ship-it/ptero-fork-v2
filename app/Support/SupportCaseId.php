<?php

declare(strict_types=1);

namespace Pterodactyl\Support;

/**
 * The reference an administrator and a suspended account both quote when talking about a
 * suspension. Six characters, generated from a CSPRNG, stored under a UNIQUE index.
 *
 * The alphabet drops `0`, `1`, `I` and `O` because the id is read aloud and typed into a
 * support ticket; it carries no user data, and nothing about it is sequential, so it must
 * never be treated as an authorization token on its own.
 */
final class SupportCaseId
{
    public const string CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    public const int LENGTH = 6;

    public static function generate(): string
    {
        $last = mb_strlen(self::CHARSET) - 1;
        $id = '';

        for ($i = 0; $i < self::LENGTH; $i++) {
            $id .= self::CHARSET[random_int(0, $last)];
        }

        return $id;
    }

    /**
     * Prepare typed input for an exact lookup, or reject it. Returns null for anything
     * that cannot be a case id so callers skip the query instead of scanning the index
     * with a value that can never match.
     */
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $candidate = mb_strtoupper(trim((string) $value));
        $pattern = '/^['.preg_quote(self::CHARSET, '/').']{'.self::LENGTH.'}\z/';

        return preg_match($pattern, $candidate) === 1 ? $candidate : null;
    }
}
