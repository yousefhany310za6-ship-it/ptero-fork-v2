<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

use Monitoring\Host;
use TroxeAnalytics\Models\State;
use TroxeAnalytics\Settings;

/**
 * The Resource Protection Layer: it measures the machine analytics is about to add
 * load to, and decides whether that load is currently welcome.
 *
 * Nothing here is enforced by analytics itself — the processes are launched at nice 19
 * and idle I/O class by the schedule, and the kernel does the rest. This layer is the
 * feedback on top of that: when the host is busy for reasons analytics cannot see,
 * collection halves its row budget, and when the host is out of headroom it stops
 * entirely. The panel, Wings and customer containers always win the argument.
 *
 * @phpstan-type Measurement array{
 *     level: string,
 *     reasons: list<string>,
 *     cores: int|null,
 *     load: list<float>|null,
 *     load_per_core: float|null,
 *     memory_available: int|null,
 *     memory_total: int|null,
 *     disk_free: int|null,
 *     measured_at: string
 * }
 */
final class Pressure
{
    public const string FULL = 'full';

    public const string REDUCED = 'reduced';

    public const string PAUSED = 'paused';

    public function __construct(private readonly Host $host, private readonly Settings $settings) {}

    /**
     * @phpstan-return Measurement
     */
    public function measure(): array
    {
        $cores = $this->host->cpus();
        $load = $this->host->load();
        $memory = $this->host->memory();
        $disk = $this->host->disk(base_path());

        $perCore = ($cores ?? 0) > 0 && $load !== null ? round($load[0] / $cores, 3) : null;
        $available = $memory['available'] ?? null;
        $free = $disk['free'] ?? null;

        $ceiling = $this->settings->loadCeiling();
        $reasons = [];
        $level = self::FULL;

        if ($perCore !== null) {
            if ($perCore >= $ceiling * 2) {
                $level = self::PAUSED;
                $reasons[] = sprintf('load per core %.2f is past %.2f x2', $perCore, $ceiling);
            } elseif ($perCore >= $ceiling) {
                $level = self::REDUCED;
                $reasons[] = sprintf('load per core %.2f is past %.2f', $perCore, $ceiling);
            }
        }

        $memoryFloor = $this->settings->memoryFloorMib() * 1048576;
        if ($available !== null && $available < $memoryFloor) {
            $level = self::PAUSED;
            $reasons[] = sprintf('only %d MiB memory available, floor is %d MiB', intdiv($available, 1048576), $this->settings->memoryFloorMib());
        }

        $diskFloor = $this->settings->diskFloorMib() * 1048576;
        if ($free !== null && $free < $diskFloor) {
            $level = self::PAUSED;
            $reasons[] = sprintf('only %d MiB free on the panel disk, floor is %d MiB', intdiv($free, 1048576), $this->settings->diskFloorMib());
        }

        return [
            'level' => $level,
            'reasons' => $reasons,
            'cores' => $cores,
            'load' => $load,
            'load_per_core' => $perCore,
            'memory_available' => $available,
            'memory_total' => $memory['total'] ?? null,
            'disk_free' => $free,
            'measured_at' => (string) now()->toIso8601String(),
        ];
    }

    /**
     * The most recent measurement, recorded by a collection pass. Reading a stored
     * value is deliberate: an admin request must not reach for /proc to decide
     * whether the dashboard shows a number.
     *
     * @phpstan-return Measurement|null
     */
    public function last(): ?array
    {
        $stored = State::readJson(State::LAST_PRESSURE);

        return $stored === [] ? null : $stored;
    }

    public function record(array $measurement): void
    {
        State::writeJson(State::LAST_PRESSURE, $measurement);
    }

    /** Whether a pass may do any work at all. */
    public function mayProceed(array $measurement): bool
    {
        return $measurement['level'] !== self::PAUSED;
    }

    /**
     * Rows a pass may read at this pressure level.
     *
     * @param  Measurement  $measurement
     */
    public function rowsBudget(array $measurement): int
    {
        $budget = $this->settings->maxRowsPerPass();

        return $measurement['level'] === self::REDUCED ? max(100, intdiv($budget, 4)) : $budget;
    }
}
