<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Announcements;

use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Models\Announcement;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The publication state machine. Every edge is explicit; anything not listed
 * here cannot happen regardless of payload — which is why status is not a
 * writable field on the create/update rules.
 */
final class SetAnnouncementPublishState
{
    /**
     * transition => allowed source statuses.
     */
    private const EDGES = [
        'publish' => [AnnouncementStatus::Draft, AnnouncementStatus::Scheduled, AnnouncementStatus::Paused],
        'schedule' => [AnnouncementStatus::Draft, AnnouncementStatus::Paused],
        'pause' => [AnnouncementStatus::Published, AnnouncementStatus::Scheduled],
        'archive' => [AnnouncementStatus::Draft, AnnouncementStatus::Scheduled, AnnouncementStatus::Published, AnnouncementStatus::Paused],
    ];

    public function publish(Announcement $announcement): Announcement
    {
        $this->assertEdge($announcement, 'publish');

        if ($announcement->expires_at !== null && $announcement->expires_at->lessThanOrEqualTo(CarbonImmutable::now())) {
            throw ValidationException::withMessages([
                'expires_at' => 'Cannot publish an already-expired announcement.',
            ]);
        }

        $announcement->status = AnnouncementStatus::Published;
        $announcement->published_at = CarbonImmutable::now();
        // Immediate publish: the window opens now unless the admin already
        // set an explicit start.
        $announcement->publish_at ??= CarbonImmutable::now();
        $announcement->save();

        return $announcement;
    }

    public function schedule(Announcement $announcement, CarbonImmutable $publishAt): Announcement
    {
        $this->assertEdge($announcement, 'schedule');

        if ($publishAt->lessThanOrEqualTo(CarbonImmutable::now())) {
            throw ValidationException::withMessages([
                'publish_at' => 'Scheduled publication must be in the future.',
            ]);
        }

        if ($announcement->expires_at !== null && $publishAt->greaterThanOrEqualTo($announcement->expires_at)) {
            throw ValidationException::withMessages([
                'publish_at' => 'Scheduled publication must come before expiry.',
            ]);
        }

        $announcement->status = AnnouncementStatus::Scheduled;
        $announcement->publish_at = $publishAt;
        $announcement->save();

        return $announcement;
    }

    public function pause(Announcement $announcement): Announcement
    {
        $this->assertEdge($announcement, 'pause');

        $announcement->status = AnnouncementStatus::Paused;
        $announcement->save();

        return $announcement;
    }

    public function archive(Announcement $announcement): Announcement
    {
        $this->assertEdge($announcement, 'archive');

        $announcement->status = AnnouncementStatus::Archived;
        $announcement->save();

        return $announcement;
    }

    private function assertEdge(Announcement $announcement, string $transition): void
    {
        if (!in_array($announcement->status, self::EDGES[$transition], true)) {
            throw new HttpException(409, sprintf(
                'Cannot move announcement %s from %s to %s.',
                $announcement->id,
                $announcement->status->value,
                $transition,
            ));
        }
    }
}
