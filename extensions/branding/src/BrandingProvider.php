<?php

declare(strict_types=1);

namespace Branding;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingFiles;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsRegistry;
use Branding\Support\Importer;
use Throwable;

/**
 * Uploads go through the panel's own extension file store (type checked from the file's
 * contents, random names, served from /extension-files/branding/...). Everything is set
 * under Admin -> Extensions -> Branding -> Settings; no extra pages needed.
 */
class BrandingProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make('favicon', 'favicon', null)
                ->label('Favicon')
                ->tab('Favicon')
                ->file(['image/png', 'image/x-icon', 'image/svg+xml', 'image/webp', 'image/gif', 'image/jpeg'], 512)
                ->frontend()
                ->public(),
            ExtensionSettingDefinition::make('logo', 'logo', null)
                ->label('Logo')
                ->tab('Logo')
                ->file([...ExtensionSettingFiles::IMAGES, 'image/svg+xml'], 2048)
                ->frontend()
                ->public(),
            ExtensionSettingDefinition::make('logo_collapsed', 'logo_collapsed', null)
                ->label('Logo for the collapsed sidebar')
                ->help('A square version (an icon or monogram) shown when the sidebar is collapsed to icons. Empty: the logo above, made smaller.')
                ->tab('Logo')
                ->file([...ExtensionSettingFiles::IMAGES, 'image/svg+xml'], 1024)
                ->frontend()
                ->public(),
            ExtensionSettingDefinition::make('logo_mode', 'logo_mode', 'beside', ['required', 'string', 'in:off,beside,replace'])
                ->label('Logo placement')
                ->tab('Logo')
                ->field('select', [
                    ['value' => 'beside', 'label' => 'Next to the company name'],
                    ['value' => 'replace', 'label' => 'Replace the company name'],
                    ['value' => 'off', 'label' => 'Don’t show the logo'],
                ])
                ->frontend()
                ->public()
                ->frontendType('string'),
            ExtensionSettingDefinition::make('logo_mascot', 'logo_mascot', true, ['required', 'boolean'])
                ->label('Replace the Pterodactyl picture')
                ->help('Shows the logo instead of the Pterodactyl picture on the sign-in pages.')
                ->tab('Logo')
                ->field('toggle')
                ->frontend()
                ->public()
                ->frontendType('boolean'),
            ExtensionSettingDefinition::make('logo_height', 'logo_height', 48, ['required', 'integer', 'min:16', 'max:64'])
                ->label('Logo height (px)')
                ->tab('Logo')
                ->field('number')
                ->frontend()
                ->public()
                ->frontendType('number'),
        ]));

        // Served in the page head for every visitor, so the favicon is right before any
        // script runs; it replaces the panel's own favicon tags.
        $this->registerHeadTags(function (): array {
            try {
                $url = app(ExtensionSettingsRegistry::class)->get('branding')?->get('favicon');
            } catch (Throwable) {
                return [];
            }
            if (! is_string($url) || $url === '') {
                return [];
            }

            return [
                ['tag' => 'link', 'rel' => 'icon', 'href' => $url],
                ['tag' => 'link', 'rel' => 'shortcut icon', 'href' => $url],
                ['tag' => 'link', 'rel' => 'apple-touch-icon', 'href' => $url],
            ];
        });

        // Page loads only: bring over a logo and favicon uploaded in ThemesPlus 2.0, once.
        if (! $this->app->runningInConsole() && request()->isMethod('GET') && ! request()->is('api/*', 'extension-files/*', 'assets/*', 'extensions/*')) {
            rescue(fn () => (new Importer($this->settings()))->run());
        }
    }
}
