<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

/**
 * Folds an access-log request target into a route key.
 *
 * Stored per-route counts are only useful while their cardinality is bounded by the size
 * of the panel's URL surface. Without this, ten thousand file-manager requests become ten
 * thousand rows, so object identifiers are replaced before anything is written. Static
 * asset paths collapse to a single key because they are noise in an API breakdown.
 */
final class RouteNormalizer
{
    private const int MAX_LENGTH = 191;

    /** @var list<string> top-level paths that are files, not endpoints */
    private const array STATIC = ['assets', 'favicons', 'locales', 'themes', 'build'];

    /**
     * Top-level segments that belong to the panel. Everything else is not this application:
     * on this install the access log is mostly scanner traffic for WordPress, `.env` and
     * `.git`, which would otherwise dominate both the route breakdown and the error rate and
     * has its own table instead.
     */
    private const array PANEL_PREFIXES = [
        '', 'account', 'act', 'admin', 'api', 'auth', 'daemon', 'extensions', 'index.php',
        'node', 'nodes', 'panel', 'remote', 'server', 'servers', 'subusers', 'up', 'user',
    ];

    /** Path key for a request that is not part of the panel's own surface. */
    public const string OFF_SURFACE = '/unmatched';

    /**
     * A UUID, a long hex hash, an all-digit segment, or the panel's eight-character short
     * server id. The short id must contain a digit: without that condition, ordinary eight
     * letter path words such as `activity` are mistaken for identifiers.
     */
    private const string IDENTIFIER = '~^(?:[0-9a-f]{8}-[0-9a-f-]{27,33}|[0-9a-f]{16,64}|[0-9]{1,32}|(?=[a-z0-9]{8}$)(?=[a-z]*[0-9])[a-z0-9]{8})$~i';

    /** Anything that is plainly an identifier, including the panel's hashed route bindings. */
    private const string OPAQUE = '~^[A-Za-z0-9_-]{20,}$~';

    public static function normalize(string $path): string
    {
        $path = parse_url($path, PHP_URL_PATH);

        if (! is_string($path) || $path === '') {
            return '/';
        }

        $segments = explode('/', trim($path, '/'));
        $first = mb_strtolower($segments[0] ?? '');

        if (in_array($first, self::STATIC, true)) {
            return '/static';
        }

        if (! in_array($first, self::PANEL_PREFIXES, true)) {
            return self::OFF_SURFACE;
        }

        $out = [];

        foreach ($segments as $index => $segment) {
            if ($segment === '') {
                continue;
            }

            if ($index > 0 && (preg_match(self::IDENTIFIER, $segment) === 1 || preg_match(self::OPAQUE, $segment) === 1)) {
                $segment = '{id}';
            }

            if ($out !== [] && end($out) === $segment && $segment === '{id}') {
                continue;
            }

            $out[] = $segment;
        }

        $route = '/'.implode('/', $out);

        return mb_strlen($route) > self::MAX_LENGTH ? mb_substr($route, 0, self::MAX_LENGTH) : $route;
    }

    /** Whether a normalised key is the catch-all for traffic outside the panel. */
    public static function isOffSurface(string $route): bool
    {
        return $route === self::OFF_SURFACE;
    }

    /** Whether a status code counts as a server-side failure for the error mix. */
    public static function isServerError(int $status): bool
    {
        return $status >= 500 && $status <= 599;
    }

    public static function isClientError(int $status): bool
    {
        return $status >= 400 && $status <= 499;
    }
}
