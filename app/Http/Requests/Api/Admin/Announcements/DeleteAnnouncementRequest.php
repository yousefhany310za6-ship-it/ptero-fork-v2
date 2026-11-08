<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class DeleteAnnouncementRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsDelete];
    }
}
