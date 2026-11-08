<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

enum AnnouncementStatus: string
{
    case Draft = 'draft';
    case Scheduled = 'scheduled';
    case Published = 'published';
    case Paused = 'paused';
    case Archived = 'archived';
}
