<?php

declare(strict_types=1);

namespace TroxeAnalytics;

use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;

/**
 * @phpstan-type Levels array<string, mixed>
 */
final readonly class Settings
{
    public const string EXTENSION = 'troxe-analytics';

    public function __construct(private ExtensionSettingsRegistry $registry) {}

    /** Master switch. When false, no collection pass runs and no schedule entry is registered. */
    public function enabled(): bool
    {
        return (bool) $this->get('enabled', true);
    }

    public function collectHttp(): bool
    {
        return $this->enabled() && (bool) $this->get('collect_http', true);
    }

    public function collectSecurity(): bool
    {
        return $this->enabled() && (bool) $this->get('collect_security', true);
    }

    public function collectNodes(): bool
    {
        return $this->enabled() && (bool) $this->get('collect_nodes', true);
    }

    public function nginxLog(): string
    {
        $path = (string) $this->get('nginx_log', '/var/log/nginx/pterodactyl.app-access.access');

        return mb_trim($path);
    }

    /**
     * Days the per-minute tiers are kept. Only the panel host's own minute rows and one
     * request row per minute exist here, so the cost of a longer window is small — but these
     * are the only rows whose count grows with time rather than with the fleet.
     */
    public function retainMinuteDays(): int
    {
        return max(1, (int) $this->get('retain_minute_days', 2));
    }

    public function retainHourlyDays(): int
    {
        return max(1, (int) $this->get('retain_hourly_days', 90));
    }

    public function retainDailyDays(): int
    {
        return max(30, (int) $this->get('retain_daily_days', 730));
    }

    public function retainHttpDays(): int
    {
        return max(1, (int) $this->get('retain_http_days', 30));
    }

    public function retainSecurityDays(): int
    {
        return max(30, (int) $this->get('retain_security_days', 365));
    }

    /** Per-core load average at which collection degrades; twice that and it stops. */
    public function loadCeiling(): float
    {
        return max(0.5, (float) $this->get('load_ceiling', 1.5));
    }

    public function memoryFloorMib(): int
    {
        return max(0, (int) $this->get('memory_floor_mib', 512));
    }

    public function diskFloorMib(): int
    {
        return max(0, (int) $this->get('disk_floor_mib', 1024));
    }

    /** Rows a single pass may read. The cursor is left where the pass stopped, so nothing is lost. */
    public function maxRowsPerPass(): int
    {
        return max(100, (int) $this->get('max_rows_per_pass', 20000));
    }

    /** Seconds after which a pass stops itself and leaves the rest for the next run. */
    public function maxDurationSeconds(): int
    {
        return max(5, (int) $this->get('max_duration_seconds', 120));
    }

    private function get(string $key, mixed $default): mixed
    {
        return $this->registry->get(self::EXTENSION)?->get($key) ?? $default;
    }
}
