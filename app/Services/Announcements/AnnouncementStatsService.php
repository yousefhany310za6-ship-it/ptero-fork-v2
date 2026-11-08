<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Announcements;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Announcement;

/**
 * Read-side counters for the admin UI. shown/acked/dismissed count DISTINCT
 * users for the CURRENT content version (the interaction table is keyed one
 * row per user+version, so re-renders and polling never inflate them);
 * eligible is the audience size, clearly separated from actual views.
 */
final class AnnouncementStatsService
{
    /**
     * @return array{content_version: int, eligible: int, shown: int, acked: int, dismissed: int}
     */
    public function for(Announcement $announcement): array
    {
        $version = $announcement->content_version;

        $interactions = DB::table('announcement_interactions')
            ->where('announcement_id', $announcement->id)
            ->where('version', $version);

        return [
            'content_version' => $version,
            'eligible' => $this->eligibleCount($announcement),
            'shown' => (clone $interactions)->whereNotNull('last_shown_at')->count(),
            'acked' => (clone $interactions)->whereNotNull('acked_at')->count(),
            'dismissed' => (clone $interactions)->whereNotNull('dismissed_at')->count(),
        ];
    }

    private function eligibleCount(Announcement $announcement): int
    {
        $audience = $announcement->audienceSelector();

        if ($audience['type'] === 'users') {
            if ($audience['user_ids'] === []) {
                return 0;
            }

            return DB::table('users')->whereIn('id', $audience['user_ids'])->count();
        }

        return DB::table('users')->count();
    }
}
