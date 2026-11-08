<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Announcements;

use Illuminate\Validation\Rule;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;
use Pterodactyl\Models\AnnouncementTag;

class UpdateAnnouncementTagRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminAnnouncementsUpdate];
    }

    /**
     * @return array<string, string|array>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'between:1,60', Rule::unique(AnnouncementTag::class, 'name')->ignore($this->route('announcement_tag:id'))],
            'color' => ['sometimes', 'required', 'string', 'regex:/^#[0-9a-fA-F]{3,8}$/'],
            'icon' => ['sometimes', 'nullable', 'string', 'between:1,60'],
        ];
    }
}
