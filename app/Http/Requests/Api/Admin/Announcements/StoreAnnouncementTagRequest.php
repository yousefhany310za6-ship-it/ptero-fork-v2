<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Illuminate\Validation\Rule;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;
use Pterodactyl\Models\AnnouncementTag;

class StoreAnnouncementTagRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsCreate];
    }

    /**
     * @return array<string, string|array>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'between:1,60', Rule::unique(AnnouncementTag::class, 'name')],
            // #rgb, #rrggbb, #rrggbbaa — validated structurally; readability is asserted on the client.
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{3,8}$/'],
            'icon' => ['nullable', 'string', 'between:1,60'],
        ];
    }
}
