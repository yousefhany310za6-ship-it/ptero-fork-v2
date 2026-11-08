<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Pterodactyl\Actions\Announcements\UpdateAnnouncement;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class UpdateAnnouncementRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsUpdate];
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return UpdateAnnouncement::rules();
    }
}
