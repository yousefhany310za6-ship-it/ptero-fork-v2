<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

enum AnnouncementKind: string
{
    case Info = 'info';
    case Success = 'success';
    case Warning = 'warning';
    case Critical = 'critical';

    /** Ordering weight for the user-facing stack: lowest shows first. */
    public function rank(): int
    {
        return match ($this) {
            self::Critical => 0,
            self::Warning => 1,
            self::Success => 2,
            self::Info => 3,
        };
    }
}
