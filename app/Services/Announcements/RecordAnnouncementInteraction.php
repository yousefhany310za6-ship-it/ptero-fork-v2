<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Announcements;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Models\User;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * User-side announcement interactions. Every method re-checks visibility
 * server-side — a client cannot ack/dismiss its way around a mandate, and
 * interactions are always bound to the authenticated user (there is no user
 * parameter to spoof, so IDOR has nowhere to land).
 */
final class RecordAnnouncementInteraction
{
    /**
     * Idempotent impression: powers stats and the interval policy. Never a
     * read receipt — seeing is not acknowledging.
     */
    public function shown(Announcement $announcement, User $user): void
    {
        $this->assertVisible($announcement, $user);
        $now = CarbonImmutable::now();

        // Hand-written ON DUPLICATE KEY UPDATE: show_count must increment
        // atomically on the server, which Eloquent upsert cannot express.
        // Concurrent impressions converge on the unique (announcement, user,
        // version) key instead of duplicating or losing counts.
        DB::statement(
            'INSERT INTO announcement_interactions
                (announcement_id, user_id, version, last_shown_at, show_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE
                last_shown_at = VALUES(last_shown_at),
                show_count = show_count + 1,
                updated_at = VALUES(updated_at)',
            [
                $announcement->id,
                $user->id,
                $announcement->content_version,
                $now,
                $now,
                $now,
            ],
        );
    }

    /**
     * Explicit acknowledgement of having read the notice.
     */
    public function ack(Announcement $announcement, User $user): void
    {
        $this->assertVisible($announcement, $user);
        $now = CarbonImmutable::now();

        AnnouncementInteraction::query()->upsert(
            [[
                'announcement_id' => $announcement->id,
                'user_id' => $user->id,
                'version' => $announcement->content_version,
                'acked_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['announcement_id', 'user_id', 'version'],
            ['acked_at', 'updated_at'],
        );
    }

    /**
     * Hide the banner. Rejected while a mandate is unacknowledged.
     */
    public function dismiss(Announcement $announcement, User $user): void
    {
        $this->assertVisible($announcement, $user);

        $interaction = $this->interactionFor($announcement, $user);
        if (!AnnouncementVisibilityPolicy::canDismiss($announcement, $interaction)) {
            throw new AccessDeniedHttpException('This notice requires explicit acknowledgement before it can be dismissed.');
        }

        $now = CarbonImmutable::now();
        AnnouncementInteraction::query()->upsert(
            [[
                'announcement_id' => $announcement->id,
                'user_id' => $user->id,
                'version' => $announcement->content_version,
                'dismissed_at' => $now,
                'last_shown_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['announcement_id', 'user_id', 'version'],
            ['dismissed_at', 'last_shown_at', 'updated_at'],
        );
    }

    public function interactionFor(Announcement $announcement, User $user): ?AnnouncementInteraction
    {
        return AnnouncementInteraction::query()
            ->where('announcement_id', $announcement->id)
            ->where('user_id', $user->id)
            ->where('version', $announcement->content_version)
            ->first();
    }

    /**
     * 404 (not 403) when the banner is not currently shown to this user:
     * drafts, expired, paused, and out-of-audience announcements are
     * indistinguishable from nonexistent ones to a client.
     */
    private function assertVisible(Announcement $announcement, User $user): void
    {
        $now = CarbonImmutable::now()->getTimestamp();
        if (!AnnouncementVisibilityPolicy::isActive($announcement, $now)
            || !AnnouncementVisibilityPolicy::audienceMatches($announcement, $user->id)) {
            throw new NotFoundHttpException('The requested resource does not exist.');
        }
    }
}
