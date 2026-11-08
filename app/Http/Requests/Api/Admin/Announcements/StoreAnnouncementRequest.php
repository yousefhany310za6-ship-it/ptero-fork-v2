<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Pterodactyl\Actions\Announcements\CreateAnnouncement;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class StoreAnnouncementRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsCreate];
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return CreateAnnouncement::rules();
    }
}
