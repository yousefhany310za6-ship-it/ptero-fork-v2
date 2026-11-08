<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Announcement;

/**
 * @extends AdminResource<Announcement>
 */
class AnnouncementResource extends AdminResource
{
    public function resourceName(): string
    {
        return Announcement::RESOURCE_NAME;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $announcement = $this->resource;

        return [
            'id' => $announcement->id,
            'name' => $announcement->name,
            'title' => $announcement->title,
            'body' => $announcement->body,
            'kind' => $announcement->kind->value,
            'display_type' => $announcement->display_type->value,
            'tag_id' => $announcement->tag_id,
            'tag' => $announcement->tag ? [
                'id' => $announcement->tag->id,
                'name' => $announcement->tag->name,
                'color' => $announcement->tag->color,
                'icon' => $announcement->tag->icon,
            ] : null,
            'status' => $announcement->status->value,
            'policy' => $announcement->policy->value,
            'require_ack' => $announcement->require_ack,
            'interval_hours' => $announcement->interval_hours,
            'audience' => $announcement->audienceSelector(),
            'action_label' => $announcement->action_label,
            'action_url' => $announcement->action_url,
            'event_start' => $announcement->event_start?->toIso8601String(),
            'event_end' => $announcement->event_end?->toIso8601String(),
            'publish_at' => $announcement->publish_at?->toIso8601String(),
            'expires_at' => $announcement->expires_at?->toIso8601String(),
            'published_at' => $announcement->published_at?->toIso8601String(),
            'content_version' => $announcement->content_version,
            'created_by' => $announcement->created_by,
            'created_at' => $this->formatTimestamp($announcement->created_at),
            'updated_at' => $this->formatTimestamp($announcement->updated_at),
        ];
    }
}
