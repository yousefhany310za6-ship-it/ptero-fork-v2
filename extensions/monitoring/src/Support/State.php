<?php

declare(strict_types=1);

namespace Monitoring\Support;

final class State
{
    public const int OFFLINE = 0;

    public const int STARTING = 1;

    public const int RUNNING = 2;

    public const int STOPPING = 3;

    /** Wings could not be reached, so the real state is unknown. */
    public const int UNREACHABLE = 4;

    private const array NAMES = ['offline', 'starting', 'running', 'stopping', 'unreachable'];

    public static function fromWings(string $state): int
    {
        return match ($state) {
            'starting' => self::STARTING,
            'running' => self::RUNNING,
            'stopping' => self::STOPPING,
            default => self::OFFLINE,
        };
    }

    public static function name(int $state): string
    {
        return self::NAMES[$state] ?? 'offline';
    }
}
