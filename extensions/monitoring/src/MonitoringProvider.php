<?php

declare(strict_types=1);

namespace Monitoring;

use Illuminate\Console\Scheduling\Schedule;
use Monitoring\Console\CollectCommand;
use Monitoring\Console\PruneCommand;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class MonitoringProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();
        $this->loadExtensionMigrations();

        $this->registerPermissions('Monitoring.', [
            'read' => 'See resource history and alerts.',
            'manage' => 'Manage alert rules and the Uptime Kuma push monitor.',
        ]);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('interval', 'interval', 5, ['required', 'integer', 'in:1,2,5,10,15'])
                ->label('Sampling interval')
                ->help('Minutes between samples. Alerts and Uptime Kuma pushes follow this interval.')
                ->field('select', array_map(static fn (int $minutes): array => ['value' => $minutes, 'label' => $minutes === 1 ? '1 minute' : "{$minutes} minutes"], [1, 2, 5, 10, 15])),
            ExtensionSettingDefinition::make('retention_days', 'retention_days', 7, ['required', 'integer', 'min:1', 'max:90'])
                ->label('Keep history for (days)')
                ->field('number'),
            ExtensionSettingDefinition::make('allow_private_targets', 'allow_private_targets', false, ['boolean'])
                ->label('Allow private targets')
                ->help('Lets webhooks and Uptime Kuma push URLs point to private networks, for example a Kuma on the same host.')
                ->field('toggle'),
        ]));

        $this->registerCommands([CollectCommand::class, PruneCommand::class]);
        $this->registerSchedule(function (Schedule $schedule): void {
            $interval = $this->app->make(Settings::class)->interval();

            $schedule->command('monitoring:collect')->cron("*/{$interval} * * * *")->withoutOverlapping(5)->runInBackground();
            $schedule->command('monitoring:prune')->dailyAt('04:10')->withoutOverlapping()->runInBackground();
        });
    }
}
