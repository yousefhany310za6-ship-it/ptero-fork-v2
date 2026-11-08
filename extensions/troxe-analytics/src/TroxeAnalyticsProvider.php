<?php

declare(strict_types=1);

namespace TroxeAnalytics;

use Illuminate\Console\Scheduling\Schedule;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;
use TroxeAnalytics\Console\HttpCommand;
use TroxeAnalytics\Console\NodesCommand;
use TroxeAnalytics\Console\PruneCommand;
use TroxeAnalytics\Console\RollupCommand;
use TroxeAnalytics\Console\SecurityCommand;
use TroxeAnalytics\Console\SnapshotCommand;
use TroxeAnalytics\Console\StatusCommand;

/**
 * Troxe Analytics — the analysis layer that sits on top of the monitoring extension.
 *
 * Nothing in this file changes the panel: routes, migrations, settings, commands and the
 * schedule are all registered through the extension SDK, which stages them and rolls them
 * back if any of it fails. Disabling the extension from the admin panel removes every one of
 * them again, and the panel keeps running — analytics is a reader of the panel's own records
 * and of the host's /proc, never a dependency of anything else.
 *
 * Access is admin-only by construction rather than by convention: `registerAdminApiRoutes`
 * mounts every endpoint under `/api/admin/extensions/troxe-analytics` behind the panel's
 * root-administrator authentication, its mandatory-two-factor check, its admin throttle and
 * `EnsureExtensionIsAvailable`. No permission is registered for server subusers because there
 * is nothing here a subuser should be able to ask for — every figure is either the whole
 * fleet or another customer's. Hiding a sidebar link is not what protects these endpoints;
 * the middleware stack in front of them is.
 *
 * ## The schedule, and why it is shaped like this
 *
 * Every entry is a separate artisan process launched with `nice -n 19` and `ionice -c3`, so
 * collection competes for CPU only after everything else on the machine has been served, and
 * issues disk reads only when nothing else wants the disk. That is the isolation the settings
 * ceilings cannot give: a limit on how many rows analytics will read bounds its work, but the
 * kernel deciding that a customer container's I/O goes first is what bounds its interference.
 * Each job also re-nices itself, so running one by hand behaves the same way.
 *
 * They are staggered against the monitoring extension's own minute boundaries and against each
 * other, run without overlapping themselves, and are simply not registered when the internal
 * `enabled` switch is off — a switch that costs nothing to flip, because the schedule is
 * rebuilt on every `schedule:run`.
 */
class TroxeAnalyticsProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->loadExtensionMigrations();
        $this->registerSettings($this->definitions());
        $this->registerCommands([
            NodesCommand::class,
            RollupCommand::class,
            HttpCommand::class,
            SecurityCommand::class,
            SnapshotCommand::class,
            PruneCommand::class,
            StatusCommand::class,
        ]);
        $this->registerSchedule($this->schedule(...));
    }

    /**
     * The collection schedule. Each entry names the work, how often it is worth doing, and
     * why it is not doing it more often than that.
     */
    private function schedule(Schedule $schedule): void
    {
        if (! $this->app->make(Settings::class)->enabled()) {
            return;
        }

        // Node capacity is sampled often because it is cheap — one read of the fleet the
        // collector layer has already assembled, plus one /proc read here.
        $this->every($schedule, 'troxe-analytics:nodes', '1-59/2 * * * *', 'Analytics: node sample');

        // Requests are counted every five minutes: the tail advances by byte offset, so a
        // quieter interval costs an idle seek and a busier one costs the same read split up.
        $this->every($schedule, 'troxe-analytics:http', '3-59/5 * * * *', 'Analytics: access log');

        // Activity-log counts and the folds of fine history into coarse history are the two
        // jobs that touch aggregation, so they run on the quarter hour, apart from each other.
        $this->every($schedule, 'troxe-analytics:security', '7,22,37,52 * * * *', 'Analytics: activity counts');
        $this->every($schedule, 'troxe-analytics:rollup', '13,28,43,58 * * * *', 'Analytics: history rollups');

        // The census refreshes the same day's row, so an hourly run makes the figure for a day
        // mean "as last seen that day" rather than "as first seen".
        $this->every($schedule, 'troxe-analytics:snapshot', '50 * * * *', 'Analytics: daily census');

        // Pruning is scheduled last and at a quiet hour, one minute after the monitoring
        // extension prunes its own samples.
        $this->every($schedule, 'troxe-analytics:prune', '20 4 * * *', 'Analytics: retention');
    }

    /**
     * One scheduled pass: lowest CPU niceness, idle I/O class, never two of itself at once,
     * and never on more than one machine at a time.
     *
     * The priority is set here rather than inside PHP because `ionice` can only be applied to
     * a process at exec time; `proc_nice()` in each command covers the case of an administrator
     * running one by hand.
     */
    private function every(Schedule $schedule, string $command, string $expression, string $description): void
    {
        $schedule->exec(sprintf(
            'nice -n 19 ionice -c3 %s %s %s',
            escapeshellarg(PHP_BINARY),
            escapeshellarg(base_path('artisan')),
            $command,
        ))
            ->cron($expression)
            ->description($description)
            ->withoutOverlapping(10)
            ->onOneServer()
            ->runInBackground();
    }

    private function definitions(): ExtensionSettingsDefinition
    {
        return new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('enabled', 'enabled', true, ['boolean'])
                ->label('Analytics enabled')
                ->help('The internal kill switch. Off, no collection pass does any work and nothing is scheduled; the panel is untouched either way.')
                ->field('toggle')
                ->tab('Collection'),
            ExtensionSettingDefinition::make('collect_nodes', 'collect_nodes', true, ['boolean'])
                ->label('Node history')
                ->help('Store one row per node per pass: capacity, allocation, and — on the machine the panel runs on — processor, load and disk.')
                ->field('toggle')
                ->tab('Collection'),
            ExtensionSettingDefinition::make('collect_http', 'collect_http', true, ['boolean'])
                ->label('Panel requests')
                ->help('Count requests and errors by reading the nginx access log from the scheduled worker. No timing figure exists in that log, so none is shown.')
                ->field('toggle')
                ->tab('Collection'),
            ExtensionSettingDefinition::make('collect_security', 'collect_security', true, ['boolean'])
                ->label('Activity and security events')
                ->help('Count the events the panel already writes to its own audit log. Nothing new is observed; this only outlives the pruning of that log.')
                ->field('toggle')
                ->tab('Collection'),
            ExtensionSettingDefinition::make('nginx_log', 'nginx_log', '/var/log/nginx/pterodactyl.app-access.access', ['required', 'string', 'max:255'])
                ->label('Access log path')
                ->help('Read-only. The worker tails it by byte offset, detects rotation by inode, and never opens the file outside a scheduled pass.')
                ->field('text')
                ->tab('Collection'),

            ExtensionSettingDefinition::make('retain_minute_days', 'retain_minute_days', 2, ['required', 'integer', 'min:1', 'max:30'])
                ->label('Keep minute rows (days)')
                ->help('The only tier whose size grows with time rather than with the fleet. Long enough for the 15 minute and 1 hour windows.')
                ->field('number')
                ->tab('Retention'),
            ExtensionSettingDefinition::make('retain_hourly_days', 'retain_hourly_days', 90, ['required', 'integer', 'min:1', 'max:365'])
                ->label('Keep hour rows (days)')
                ->field('number')
                ->tab('Retention'),
            ExtensionSettingDefinition::make('retain_daily_days', 'retain_daily_days', 730, ['required', 'integer', 'min:30', 'max:3650'])
                ->label('Keep day rows (days)')
                ->field('number')
                ->tab('Retention'),
            ExtensionSettingDefinition::make('retain_http_days', 'retain_http_days', 30, ['required', 'integer', 'min:1', 'max:365'])
                ->label('Keep request routes and probe addresses (days)')
                ->field('number')
                ->tab('Retention'),
            ExtensionSettingDefinition::make('retain_security_days', 'retain_security_days', 365, ['required', 'integer', 'min:30', 'max:3650'])
                ->label('Keep event counts (days)')
                ->help('These are counts by hour and event name, not log entries, so a year of them is small.')
                ->field('number')
                ->tab('Retention'),

            ExtensionSettingDefinition::make('load_ceiling', 'load_ceiling', 1.5, ['required', 'numeric', 'min:0.1', 'max:16'])
                ->label('Load per core before collection slows')
                ->help('At this figure a pass quarters the rows it reads; at twice it, the pass stops and leaves its cursor where it got to. The panel and its customers always win.')
                ->field('number')
                ->tab('Resource protection'),
            ExtensionSettingDefinition::make('memory_floor_mib', 'memory_floor_mib', 512, ['required', 'integer', 'min:0', 'max:1048576'])
                ->label('Free memory floor (MiB)')
                ->help('Below this, collection stops rather than pushes the machine toward swapping.')
                ->field('number')
                ->tab('Resource protection'),
            ExtensionSettingDefinition::make('disk_floor_mib', 'disk_floor_mib', 1024, ['required', 'integer', 'min:0', 'max:1073741824'])
                ->label('Free disk floor (MiB)')
                ->help('Below this, collection stops. A filesystem that fills up takes the panel and every container on it with it.')
                ->field('number')
                ->tab('Resource protection'),
            ExtensionSettingDefinition::make('max_rows_per_pass', 'max_rows_per_pass', 20000, ['required', 'integer', 'min:100', 'max:1000000'])
                ->label('Rows per pass')
                ->help('A ceiling on work per run, not on total work: whatever a pass does not reach is picked up by the next one.')
                ->field('number')
                ->tab('Resource protection'),
            ExtensionSettingDefinition::make('max_duration_seconds', 'max_duration_seconds', 120, ['required', 'integer', 'min:5', 'max:3600'])
                ->label('Seconds per pass')
                ->help('After this a pass stops itself and stores its cursor, so a long backlog is worked off across many passes instead of in one that runs over.')
                ->field('number')
                ->tab('Resource protection'),
        ]);
    }
}
