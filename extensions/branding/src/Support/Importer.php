<?php

declare(strict_types=1);

namespace Branding\Support;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use Pterodactyl\Services\Extensions\ExtensionSettings;
use Pterodactyl\Services\Extensions\ExtensionSettingValueGuard;

/**
 * ThemesPlus 2.0 briefly included branding. If a logo or favicon was uploaded there, copy the
 * files and the logo options across once. Nothing that already exists here is overwritten.
 */
final readonly class Importer
{
    private const string DONE = '_imported';

    /** Where the panel's extension file store keeps uploads. */
    private const string FILES = 'extension-files';

    public function __construct(private ExtensionSettings $settings) {}

    public function run(): void
    {
        if ($this->settings->get(self::DONE) === true) {
            return;
        }

        $old = new ExtensionSettings('themes-plus');
        $disk = Storage::disk(is_string($configured = config('extensions.files_disk')) && $configured !== '' ? $configured : config('filesystems.default'));

        foreach (['logo', 'favicon'] as $key) {
            $name = ExtensionSettingValueGuard::fileReference($old->get($key));
            if ($name === null || $this->settings->get($key) !== null) {
                continue;
            }
            if ($this->copy($disk, $name)) {
                $this->settings->set($key, $name);
            }
        }

        foreach (['logo_mode', 'logo_height'] as $key) {
            $value = $old->get($key);
            if ($value !== null && $this->settings->get($key) === null) {
                $this->settings->set($key, $value);
            }
        }

        $this->settings->set(self::DONE, true);
    }

    private function copy(Filesystem $disk, string $name): bool
    {
        $from = self::FILES.'/themes-plus/'.$name;
        $to = self::FILES.'/branding/'.$name;
        if (! $disk->exists($from)) {
            return false;
        }

        return $disk->exists($to) || $disk->copy($from, $to);
    }
}
