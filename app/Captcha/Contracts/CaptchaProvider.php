<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Contracts;

use Pterodactyl\Captcha\Value\ProviderSettings;
use Pterodactyl\Captcha\Value\VerificationResult;

interface CaptchaProvider
{
    public function name(): string;

    public function label(): string;

    /** The request field this provider's token arrives in; no other field is ever accepted. */
    public function tokenField(): string;

    public function siteKey(): string;

    public function scriptUrl(): string;

    public function settings(): ProviderSettings;

    public function isEnabled(): bool;

    /**
     * What is wrong with this provider's own setup, in words an administrator can act on. Empty
     * when the provider can be used.
     *
     * @return list<string>
     */
    public function configurationErrors(): array;

    /** Ask the provider about a token. Never throws, and never passes on a network error. */
    public function verify(string $token, ?string $ip): VerificationResult;
}
