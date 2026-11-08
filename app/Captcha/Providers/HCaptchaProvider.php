<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Providers;

use Pterodactyl\Captcha\Value\VerificationResult;

/**
 * hCaptcha. A reply can also say the site key itself is switched off at hCaptcha, which is a
 * configuration problem here rather than a user failing a challenge.
 */
final class HCaptchaProvider extends SiteVerifyProvider
{
    /** @param  array<array-key, mixed>  $payload */
    protected function analyze(array $payload): VerificationResult
    {
        $codes = $this->errorCodes($payload);
        $hostname = $this->hostname($payload);

        if ($this->disabled($payload) !== []) {
            return VerificationResult::failed(
                $this->name(),
                ['hCaptcha has this site key disabled: '.implode(', ', $this->disabled($payload))],
                $codes,
                $hostname
            );
        }

        if (! $this->success($payload)) {
            return VerificationResult::failed($this->name(), ['hCaptcha rejected the token'], $codes, $hostname);
        }

        return VerificationResult::passed($this->name(), [
            'hostname' => $hostname,
            'expires_at' => $this->expiresAt($payload),
            'error_codes' => $codes,
        ]);
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @return list<string>
     */
    private function disabled(array $payload): array
    {
        $disabled = $payload['disabled'] ?? [];

        if (! is_array($disabled)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $code): ?string => is_string($code) && $code !== '' ? $code : null,
            $disabled
        )));
    }
}
