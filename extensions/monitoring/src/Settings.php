<?php

declare(strict_types=1);

namespace Monitoring;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;

final readonly class Settings
{
    public function __construct(private ExtensionSettingsRegistry $registry) {}

    /** Minutes between samples. */
    public function interval(): int
    {
        return max(1, (int) $this->get('interval', 5));
    }

    public function retentionDays(): int
    {
        return max(1, (int) $this->get('retention_days', 7));
    }

    public function allowPrivateTargets(): bool
    {
        return (bool) $this->get('allow_private_targets', false);
    }

    private function get(string $key, mixed $default): mixed
    {
        return $this->registry->get('monitoring')?->get($key) ?? $default;
    }
}
