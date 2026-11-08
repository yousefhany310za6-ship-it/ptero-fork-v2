<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Value;

/**
 * What a provider said about one token. It carries the claims the panel checks and never the token
 * itself, so a result can be logged without leaking anything a replay would need.
 */
final readonly class VerificationResult
{
    /**
     * @param  list<string>  $errorCodes  codes the provider returned, safe to log and to show
     * @param  list<string>  $reasons  why the panel rejected the token, in the panel's own words
     */
    public function __construct(
        public bool $passed,
        public string $provider,
        public ?string $hostname = null,
        public ?string $action = null,
        public ?int $expiresAt = null,
        public array $errorCodes = [],
        public array $reasons = [],
    ) {}

    /** @param array{hostname?: string|null, action?: string|null, expires_at?: int|null, error_codes?: list<string>} $claims */
    public static function passed(string $provider, array $claims = []): self
    {
        return new self(
            passed: true,
            provider: $provider,
            hostname: self::stringOrNull($claims['hostname'] ?? null),
            action: self::stringOrNull($claims['action'] ?? null),
            expiresAt: self::intOrNull($claims['expires_at'] ?? null),
            errorCodes: $claims['error_codes'] ?? [],
        );
    }

    /**
     * @param  list<string>  $reasons
     * @param  list<string>  $errorCodes
     */
    public static function failed(string $provider, array $reasons, array $errorCodes = [], ?string $hostname = null): self
    {
        return new self(
            passed: false,
            provider: $provider,
            hostname: $hostname,
            errorCodes: $errorCodes,
            reasons: $reasons,
        );
    }

    private static function stringOrNull(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private static function intOrNull(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }
}
