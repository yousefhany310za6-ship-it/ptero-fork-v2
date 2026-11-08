<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Providers;

use Pterodactyl\Captcha\Value\VerificationResult;

/** Invisible reCAPTCHA v2. It answers with the hostname the widget ran on and no action of its own. */
final class RecaptchaProvider extends SiteVerifyProvider
{
    /** @param  array<array-key, mixed>  $payload */
    protected function analyze(array $payload): VerificationResult
    {
        $codes = $this->errorCodes($payload);

        if (! $this->success($payload)) {
            return VerificationResult::failed($this->name(), ['reCAPTCHA rejected the token'], $codes, $this->hostname($payload));
        }

        return VerificationResult::passed($this->name(), [
            'hostname' => $this->hostname($payload),
            'error_codes' => $codes,
        ]);
    }
}
