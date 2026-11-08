<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Settings;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Settings\UpdateCaptchaSettingsRequest;
use Pterodactyl\Models\Setting;
use Pterodactyl\Providers\SettingsServiceProvider;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Settings', 'View and update global panel settings.')]
class UpdateCaptchaController extends AdminApiController
{
    /**
     * Update the captcha settings.
     */
    #[Endpoint('Update captcha settings', 'Stores the captcha master switch, provider keys and rules, and restarts queued workers so they reload configuration.')]
    #[ScribeResponse(status: 204, description: 'Captcha settings updated.')]
    public function __invoke(UpdateCaptchaSettingsRequest $request, Kernel $kernel): Response
    {
        foreach ($request->normalize() as $key => $value) {
            if (in_array($key, SettingsServiceProvider::getEncryptedKeys(), true) && ! empty($value)) {
                $value = Crypt::encrypt($value);
            }

            Setting::put('settings::'.$key, ($value) === null ? null : (string) $value);
        }

        $kernel->call('queue:restart');

        return $this->returnNoContent();
    }
}
