<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

enum IpBanDuration: string
{
    case Permanent = 'permanent';
    case Temporary = 'temporary';

    /** A temporary ban is meaningless without the moment it stops applying. */
    public function requiresExpiry(): bool
    {
        return $this === self::Temporary;
    }
}
