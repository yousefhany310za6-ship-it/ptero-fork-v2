<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Rules;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * One action the panel can insist on verifying, and what verification means for it: which endpoint
 * it is wired to, which provider answers for it, and how strictly the provider's answer is read.
 *
 * Rules live in the database as JSON, not as conditions spread across controllers and route files.
 */
final readonly class CaptchaRule
{
    /**
     * @param  list<string>  $methods
     */
    public function __construct(
        public string $key,
        public ?string $path = null,
        public ?string $route = null,
        public array $methods = ['POST'],
        public ?string $provider = null,
        public bool $required = true,
        public ?string $action = null,
        public bool $requireAction = false,
        public ?bool $hostnameCheck = null,
    ) {}

    /**
     * @param  array<array-key, mixed>  $attributes
     */
    public static function fromArray(array $attributes, string $fallbackKey = ''): self
    {
        $string = static function (mixed $value): ?string {
            return is_string($value) && ($trimmed = trim($value)) !== '' ? $trimmed : null;
        };

        return new self(
            key: $string($attributes['key'] ?? null) ?? $fallbackKey,
            path: $string($attributes['path'] ?? null),
            route: $string($attributes['route'] ?? null),
            methods: self::normalizeMethods($attributes['methods'] ?? []),
            provider: $string($attributes['provider'] ?? null),
            required: (bool) ($attributes['required'] ?? true),
            action: $string($attributes['action'] ?? null),
            requireAction: (bool) ($attributes['require_action'] ?? false),
            hostnameCheck: array_key_exists('hostname_check', $attributes)
                ? (bool) $attributes['hostname_check']
                : null,
        );
    }

    /**
     * What an administrator sees and edits. Nothing is left out: saving this back rebuilds the rule
     * exactly, so a round trip cannot silently loosen a check.
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'key' => $this->key,
            'path' => $this->path,
            'route' => $this->route,
            'methods' => $this->methods,
            'provider' => $this->provider,
            'required' => $this->required,
            'action' => $this->action,
            'require_action' => $this->requireAction,
            'hostname_check' => $this->hostnameCheck,
        ];
    }

    /** A rule that names no endpoint is known to the panel but not wired to any request yet. */
    public function isWired(): bool
    {
        return $this->path !== null || $this->route !== null;
    }

    public function matches(Request $request): bool
    {
        if (! in_array(mb_strtoupper($request->getMethod()), $this->methods, true)) {
            return false;
        }

        if ($this->route !== null && ! $request->routeIs($this->route)) {
            return false;
        }

        if ($this->path !== null) {
            return Str::is(trim($this->path, '/'), trim($request->path(), '/'));
        }

        return $this->route !== null;
    }

    public function label(): string
    {
        return Str::headline(str_replace(['.', '-', '_'], ' ', $this->key));
    }

    /**
     * An administrator types these freely, so anything that is not a word is dropped rather than
     * cast, and an empty list still means the rule guards a POST.
     *
     * @return list<string>
     */
    private static function normalizeMethods(mixed $methods): array
    {
        $normalized = [];

        foreach (is_array($methods) ? $methods : [] as $method) {
            if (! is_scalar($method)) {
                continue;
            }

            $verb = mb_strtoupper(trim((string) $method));

            if ($verb !== '') {
                $normalized[] = $verb;
            }
        }

        return array_values(array_unique($normalized)) ?: ['POST'];
    }
}
