<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Value;

/**
 * One provider's settings, read from the configuration the database may have overridden. It holds
 * a secret key, and nothing that reads it is allowed to print it.
 */
final readonly class ProviderSettings
{
    /**
     * @param  list<string>  $allowedVerifyHosts
     * @param  list<string>  $allowedScriptHosts
     */
    public function __construct(
        public string $name,
        public string $label,
        public bool $enabled,
        public string $siteKey,
        public string $secretKey,
        public string $verifyUrl,
        public string $scriptUrl,
        public string $tokenField,
        public bool $hostnameCheck,
        public array $allowedVerifyHosts,
        public array $allowedScriptHosts,
        public ?string $shippedSiteKey = null,
        public ?string $shippedSecretKey = null,
    ) {}

    public function usesShippedKeys(): bool
    {
        return $this->shippedSiteKey !== null
            && ($this->siteKey === $this->shippedSiteKey || $this->secretKey === $this->shippedSecretKey);
    }
}
