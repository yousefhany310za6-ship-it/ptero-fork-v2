<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Settings;

use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class TestCaptchaProviderRequest extends AdminApiRequest
{
    /** Spending an outbound call with a stored secret is a write-level action, as test mail is. */
    public function permissions(): array
    {
        return [Permissions::AdminSettingsUpdate];
    }
}
