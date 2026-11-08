<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Providers;

use Illuminate\Support\Facades\Http;
use Pterodactyl\Captcha\Contracts\CaptchaProvider;
use Pterodactyl\Captcha\Value\ProviderSettings;
use Pterodactyl\Captcha\Value\VerificationResult;
use Throwable;

/**
 * The shape every one of these providers shares: a form post to a site-verify endpoint that answers
 * with JSON saying whether the token was solved. Everything that can go wrong - an unreachable
 * endpoint, a non-200 answer, a body that is not JSON - is a failed verification, never a pass.
 */
abstract class SiteVerifyProvider implements CaptchaProvider
{
    public function __construct(protected readonly ProviderSettings $settings) {}

    /**
     * Turn one provider's reply into a result. The payload has already been read; a field that is
     * missing or of the wrong type means the reply cannot be trusted.
     *
     * @param  array<array-key, mixed>  $payload
     */
    abstract protected function analyze(array $payload): VerificationResult;

    public function name(): string
    {
        return $this->settings->name;
    }

    public function label(): string
    {
        return $this->settings->label;
    }

    public function tokenField(): string
    {
        return $this->settings->tokenField;
    }

    public function siteKey(): string
    {
        return $this->settings->siteKey;
    }

    public function scriptUrl(): string
    {
        return $this->settings->scriptUrl;
    }

    public function settings(): ProviderSettings
    {
        return $this->settings;
    }

    public function isEnabled(): bool
    {
        return $this->settings->enabled;
    }

    /** @return list<string> */
    public function configurationErrors(): array
    {
        $errors = [];

        if ($this->settings->siteKey === '') {
            $errors[] = 'The site key is missing.';
        }

        if ($this->settings->secretKey === '') {
            $errors[] = 'The secret key is missing.';
        }

        if (! $this->hostIsAllowed($this->settings->verifyUrl, $this->settings->allowedVerifyHosts)) {
            $errors[] = 'The verification endpoint is not an official '.$this->settings->label.' host.';
        }

        if (! $this->hostIsAllowed($this->settings->scriptUrl, $this->settings->allowedScriptHosts)) {
            $errors[] = 'The widget endpoint is not an official '.$this->settings->label.' host.';
        }

        return $errors;
    }

    public function verify(string $token, ?string $ip): VerificationResult
    {
        if ($token === '') {
            return VerificationResult::failed($this->name(), ['no token was submitted']);
        }

        if (($errors = $this->configurationErrors()) !== []) {
            return VerificationResult::failed($this->name(), $errors);
        }

        $body = ['secret' => $this->settings->secretKey, 'response' => $token];

        if ($ip !== null && $ip !== '') {
            $body['remoteip'] = $ip;
        }

        try {
            $response = Http::timeout((int) config('captcha.http.timeout', 5))
                ->connectTimeout((int) config('captcha.http.connect_timeout', 2))
                ->asForm()
                ->post($this->settings->verifyUrl, $body);
        } catch (Throwable) {
            return VerificationResult::failed($this->name(), ['the provider could not be reached']);
        }

        if (! $response->successful()) {
            return VerificationResult::failed($this->name(), ['the provider replied with HTTP '.$response->status()]);
        }

        $payload = $response->json();

        if (! is_array($payload)) {
            return VerificationResult::failed($this->name(), ['the provider reply could not be read']);
        }

        return $this->analyze($payload);
    }

    /** @param list<string> $hosts */
    protected function hostIsAllowed(string $url, array $hosts): bool
    {
        $parsed = parse_url($url);

        if (($parsed['scheme'] ?? '') !== 'https' || ! isset($parsed['host'])) {
            return false;
        }

        return in_array(mb_strtolower($parsed['host']), $hosts, true);
    }

    /** @param array<array-key, mixed> $payload */
    protected function success(array $payload): bool
    {
        return ($payload['success'] ?? false) === true;
    }

    /** @param array<array-key, mixed> $payload */
    protected function hostname(array $payload): ?string
    {
        $hostname = $payload['hostname'] ?? null;

        return is_string($hostname) && $hostname !== '' ? $hostname : null;
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @return list<string>
     */
    protected function errorCodes(array $payload): array
    {
        $codes = $payload['error-codes'] ?? $payload['error_codes'] ?? [];

        if (! is_array($codes)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $code): ?string => is_string($code) && $code !== '' ? $code : null,
            $codes
        )));
    }

    /** @param array<array-key, mixed> $payload */
    protected function expiresAt(array $payload): ?int
    {
        $expiresAt = $payload['expires_at'] ?? null;

        return is_numeric($expiresAt) ? (int) $expiresAt : null;
    }
}
