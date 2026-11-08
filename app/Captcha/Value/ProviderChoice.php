<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Value;

use Pterodactyl\Captcha\Contracts\CaptchaProvider;

/**
 * The provider a rule ends up using, together with what had to be given up to get there. A choice
 * with no provider is not a bypass: it is the caller being told nothing can verify this action.
 */
final readonly class ProviderChoice
{
    /** @param list<string> $warnings */
    public function __construct(
        public ?CaptchaProvider $provider,
        public array $warnings = [],
    ) {}

    public static function used(CaptchaProvider $provider): self
    {
        return new self($provider);
    }

    /** @param list<string> $warnings */
    public static function none(array $warnings): self
    {
        return new self(null, $warnings);
    }

    public function isVerified(): bool
    {
        return $this->provider !== null;
    }
}
