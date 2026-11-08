<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

enum AnnouncementDisplayType: string
{
    /** A quiet coloured banner in the dashboard stack. */
    case Banner = 'banner';
    /** A centred popup the user must face before continuing. */
    case Modal = 'modal';
}
