<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class GetAnnouncementTagsRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsRead];
    }
}
