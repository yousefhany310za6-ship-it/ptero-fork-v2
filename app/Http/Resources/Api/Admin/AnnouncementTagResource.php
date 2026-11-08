<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\AnnouncementTag;

/**
 * @extends AdminResource<AnnouncementTag>
 */
class AnnouncementTagResource extends AdminResource
{
    public function resourceName(): string
    {
        return AnnouncementTag::RESOURCE_NAME;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $tag = $this->resource;

        return [
            'id' => $tag->id,
            'name' => $tag->name,
            'color' => $tag->color,
            'icon' => $tag->icon,
            'announcements' => $tag->announcements()->count(),
            'created_at' => $this->formatTimestamp($tag->created_at),
            'updated_at' => $this->formatTimestamp($tag->updated_at),
        ];
    }
}
