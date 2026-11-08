<?php

declare(strict_types=1);

namespace Pterodactyl\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Console\PruneCommand;
use Illuminate\Database\QueryException;
use Pterodactyl\Console\Commands\Maintenance\CleanServiceBackupFilesCommand;
use Pterodactyl\Console\Commands\Maintenance\LiftExpiredSuspensionsCommand;
use Pterodactyl\Console\Commands\Maintenance\PruneOrphanedBackupsCommand;
use Pterodactyl\Console\Commands\Maintenance\PublishDueAnnouncementsCommand;
use Pterodactyl\Console\Commands\Maintenance\RetryDeferredAccountSuspensionsCommand;
use Pterodactyl\Console\Commands\Schedule\ProcessRunnableCommand;
use Pterodactyl\Contracts\Telemetry\SendsTelemetry;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\Setting;
use Ramsey\Uuid\Uuid;

final class Scheduler
{
    public function __invoke(Schedule $schedule): void
    {
        // https://laravel.com/docs/10.x/upgrade#redis-cache-tags
        $schedule->command('cache:prune-stale-tags')->hourly();

        // Execute scheduled commands for servers every minute, as if there was a normal cron running.
        $schedule->command(ProcessRunnableCommand::class)->everyMinute()->withoutOverlapping(60)->onOneServer();
        $schedule->command(CleanServiceBackupFilesCommand::class)->daily()->withoutOverlapping();
        $schedule->command(PublishDueAnnouncementsCommand::class)->everyMinute()->withoutOverlapping(30);

        // An account can be suspended while a node is offline or a server is mid-transfer.
        // This is the retry, so the suspension does not quietly become "blocked login,
        // servers still running".
        $schedule->command(RetryDeferredAccountSuspensionsCommand::class)->everyFifteenMinutes()->withoutOverlapping(30);

        // A no-op while pterodactyl.security.auto_lift_expired is off, which is the default.
        $schedule->command(LiftExpiredSuspensionsCommand::class)->everyMinute()->withoutOverlapping(30);

        if (config('backups.prune_age')) {
            // Every 30 minutes, run the backup pruning command so that any abandoned backups can be deleted.
            $schedule->command(PruneOrphanedBackupsCommand::class)->everyThirtyMinutes()->withoutOverlapping();
        }

        if (config('activity.prune_days')) {
            $schedule->command(PruneCommand::class, ['--model' => [ActivityLog::class]])->daily()->withoutOverlapping();
        }

        // Sign-in history is the one table this feature writes on every authentication
        // attempt, so it is the one that has to be bounded. The retention window is an
        // operator's decision; zero or less turns the schedule off and leaves the rows.
        if ((int) config('pterodactyl.security.login_ip_retention_days') > 0) {
            $schedule->command(PruneCommand::class, ['--model' => [LoginEvent::class]])->daily()->withoutOverlapping();
        }

        if (config('pterodactyl.telemetry.enabled')) {
            $this->scheduleTelemetry($schedule);
        }
    }

    /**
     * Push telemetry daily at a time derived from the install uuid.
     */
    private function scheduleTelemetry(Schedule $schedule): void
    {
        try {
            $uuid = Setting::fetch('app:telemetry:uuid');
        } catch (QueryException) {
            return;
        }

        if ($uuid === null) {
            try {
                $uuid = Uuid::uuid4()->toString();
                Setting::put('app:telemetry:uuid', $uuid);
            } catch (QueryException) {
                return;
            }
        }

        $time = hexdec(str_replace('-', '', mb_substr($uuid, 27))) % 1440;
        $hour = intdiv($time, 60);
        $minute = $time % 60;

        $schedule->call(static function (SendsTelemetry $telemetry): void {
            $telemetry->send();
        })->description('Collect Telemetry')->dailyAt(sprintf('%02d:%02d', $hour, $minute))->withoutOverlapping();
    }
}
