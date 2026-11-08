<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Announcements;

use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Models\Announcement;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class DeleteAnnouncement
{
    /**
     * Live banners die loudly: pause or archive first so removal is always a
     * two-step, and published history stays queryable under an archived row.
     * Interactions cascade with the announcement row (FK onDelete: cascade).
     */
    public function handle(Announcement $announcement): void
    {
        if ($announcement->status === AnnouncementStatus::Published) {
            throw new HttpException(409, 'Pause or archive a published announcement before deleting it.');
        }

        $announcement->delete();
    }
}
