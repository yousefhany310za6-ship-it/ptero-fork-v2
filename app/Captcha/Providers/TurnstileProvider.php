<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Providers;

use Pterodactyl\Captcha\Value\VerificationResult;

/**
 * Cloudflare Turnstile. It is the only one of the three that echoes back the action the widget was
 * rendered with, so it is the only provider that can tie a token to one specific operation.
 */
final class TurnstileProvider extends SiteVerifyProvider
{
    /** @param  array<array-key, mixed>  $payload */
    protected function analyze(array $payload): VerificationResult
    {
        $codes = $this->errorCodes($payload);
        $hostname = $this->hostname($payload);

        if (! $this->success($payload)) {
            return VerificationResult::failed($this->name(), ['Turnstile rejected the token'], $codes, $hostname);
        }

        return VerificationResult::passed($this->name(), [
            'hostname' => $hostname,
            'action' => $this->action($payload),
            'error_codes' => $codes,
        ]);
    }

    /** @param array<array-key, mixed> $payload */
    private function action(array $payload): ?string
    {
        $action = $payload['action'] ?? null;

        return is_string($action) && $action !== '' ? $action : null;
    }
}
