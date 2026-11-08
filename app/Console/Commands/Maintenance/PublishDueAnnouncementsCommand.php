<?php

declare(strict_types=1);

namespace Pterodactyl\Console\Commands\Maintenance;

use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Announcement;

/**
 * Promotes due scheduled announcements to published. Runs from the panel
 * scheduler (cron every minute); a scheduled row is never visible before
 * publish_at — this is the only path that opens the window early-free.
 */
#[Description('Publishes scheduled announcements whose start time has arrived.')]
#[Signature('p:maintenance:publish-announcements')]
class PublishDueAnnouncementsCommand extends Command
{
    public function handle(): void
    {
        $now = CarbonImmutable::now();

        $due = Announcement::query()
            ->where('status', AnnouncementStatus::Scheduled->value)
            ->whereNotNull('publish_at')
            ->where('publish_at', '<=', $now)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', $now))
            ->get();

        foreach ($due as $announcement) {
            // Guarded update: a concurrent pause/archive wins and this row
            // stays untouched.
            $promoted = Announcement::query()
                ->where('id', $announcement->id)
                ->where('status', AnnouncementStatus::Scheduled->value)
                ->update([
                    'status' => AnnouncementStatus::Published->value,
                    'published_at' => $now,
                    'updated_at' => $now,
                ]);

            if ($promoted > 0) {
                Activity::event('admin:announcement.autopublish')
                    ->subject($announcement)
                    ->log();
            }
        }

        $this->info(sprintf('Promoted %d scheduled announcement(s) to published.', $due->count()));
    }
}
