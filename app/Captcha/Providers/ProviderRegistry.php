<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Providers;

use Illuminate\Support\Str;
use Pterodactyl\Captcha\Contracts\CaptchaProvider;
use Pterodactyl\Captcha\Value\ProviderChoice;
use Pterodactyl\Captcha\Value\ProviderSettings;
use RuntimeException;

/**
 * Every provider the panel knows about, built from 'config/captcha.php' — the database overrides
 * that file's values through the settings service provider, so this is the only place that reads
 * them. Adding a provider is a class plus a config block; no other code changes.
 */
class ProviderRegistry
{
    /** @var array<string, CaptchaProvider>|null */
    private ?array $providers = null;

    /** @return array<string, CaptchaProvider> */
    public function all(): array
    {
        return $this->providers ??= $this->build();
    }

    /** @return list<string> */
    public function names(): array
    {
        return array_keys($this->all());
    }

    public function has(string $name): bool
    {
        return isset($this->all()[$name]);
    }

    public function get(string $name): ?CaptchaProvider
    {
        return $this->all()[$name] ?? null;
    }

    public function defaultName(): string
    {
        return (string) config('captcha.default_provider', 'recaptcha');
    }

    /**
     * Providers an administrator switched on and that are configured well enough to be used.
     *
     * @return array<string, CaptchaProvider>
     */
    public function usable(): array
    {
        return array_filter(
            $this->all(),
            static fn (CaptchaProvider $provider): bool => $provider->isEnabled() && $provider->configurationErrors() === []
        );
    }

    /**
     * Providers switched on, usable or not. An empty list means nobody asked for a captcha, which is
     * a decision; a non-empty list that yields nothing usable means someone asked for one and the
     * panel cannot deliver it, which is a failure.
     *
     * @return list<string>
     */
    public function enabledNames(): array
    {
        return array_values(array_map(
            static fn (CaptchaProvider $provider): string => $provider->name(),
            array_filter(
                $this->all(),
                static fn (CaptchaProvider $provider): bool => $provider->isEnabled()
            )
        ));
    }

    /**
     * Which provider verifies this action. The named one wins when it can be used; a named provider
     * that is switched off or missing a key falls back to the next usable one, with the reason kept
     * so it can be shown and logged. Nothing here is ever silent: a rule that asks for a provider
     * that does not exist is reported, not quietly dropped.
     */
    public function resolve(?string $preferred = null): ProviderChoice
    {
        $all = $this->all();
        $name = $preferred !== null && $preferred !== '' ? $preferred : $this->defaultName();

        if ($name === '') {
            return ProviderChoice::none(['no provider is configured as the default']);
        }

        if (! isset($all[$name])) {
            return ProviderChoice::none(['no provider is registered as "'.$name.'"']);
        }

        $requested = $all[$name];

        if (($errors = $requested->configurationErrors()) !== []) {
            return $this->fallback($requested, implode('; ', $errors));
        }

        if (! $requested->isEnabled()) {
            return $this->fallback($requested, $requested->label().' is switched off');
        }

        return ProviderChoice::used($requested);
    }

    private function fallback(CaptchaProvider $requested, string $reason): ProviderChoice
    {
        foreach ($this->all() as $provider) {
            if ($provider->name() === $requested->name()) {
                continue;
            }

            if ($provider->isEnabled() && $provider->configurationErrors() === []) {
                return new ProviderChoice($provider, [$requested->label().': '.$reason]);
            }
        }

        return new ProviderChoice(null, [$requested->label().': '.$reason]);
    }

    /** @return array<string, CaptchaProvider> */
    private function build(): array
    {
        /** @var array<string, array<string, mixed>> $definitions */
        $definitions = config('captcha.providers', []);

        $providers = [];

        foreach ($definitions as $name => $config) {
            $class = $config['class'] ?? null;

            if (! is_string($class) || ! class_exists($class) || ! is_a($class, CaptchaProvider::class, true)) {
                throw new RuntimeException('Captcha provider "'.$name.'" is not configured with a provider class.');
            }

            $providers[$name] = new $class($this->settingsFor($name, $config));
        }

        return $providers;
    }

    /**
     * @param  array<string, mixed>  $config
     *
     * @throws RuntimeException
     */
    private function settingsFor(string $name, array $config): ProviderSettings
    {
        $string = static fn (string $key, string $fallback = ''): string => is_scalar($config[$key] ?? null)
            ? (string) $config[$key]
            : $fallback;

        $boolean = static fn (string $key, bool $fallback): bool => match (true) {
            is_bool($config[$key] ?? null) => $config[$key],
            is_numeric($config[$key] ?? null) => (bool) $config[$key],
            default => $fallback,
        };

        $allow = is_array($config['allow'] ?? null) ? $config['allow'] : [];
        $hosts = static fn (string $key): array|string => is_array($allow[$key] ?? null) || is_string($allow[$key] ?? null)
            ? $allow[$key]
            : [];

        return new ProviderSettings(
            name: $name,
            label: $string('label', Str::headline($name)),
            enabled: $boolean('enabled', false),
            siteKey: $string('site_key'),
            secretKey: $string('secret_key'),
            verifyUrl: $string('verify_url'),
            scriptUrl: $string('script_url'),
            tokenField: $string('token_field', 'g-recaptcha-response'),
            hostnameCheck: $boolean('hostname_check', true),
            allowedVerifyHosts: $this->hosts($hosts('verify_hosts')),
            allowedScriptHosts: $this->hosts($hosts('script_hosts')),
            shippedSiteKey: array_key_exists('_shipped_site_key', $config) ? $string('_shipped_site_key') : null,
            shippedSecretKey: array_key_exists('_shipped_secret_key', $config) ? $string('_shipped_secret_key') : null,
        );
    }

    /**
     * @param  array<array-key, mixed>|string  $hosts
     * @return list<string>
     */
    private function hosts(array|string $hosts): array
    {
        if (is_string($hosts)) {
            $hosts = [$hosts];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $host): ?string => is_string($host) && $host !== '' ? mb_strtolower($host) : null,
            $hosts
        )));
    }
}
