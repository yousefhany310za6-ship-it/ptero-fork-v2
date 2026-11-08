<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

enum AnnouncementDisplayPolicy: string
{
    /** Show until the user dismisses or acknowledges this version. */
    case Once = 'once';
    /** Show on every dashboard visit while active. */
    case EveryVisit = 'every_visit';
    /** Re-show every interval_hours after the last sighting. */
    case Interval = 'interval';
    /** Stay visible until the user explicitly acknowledges. */
    case UntilAck = 'until_ack';
}
