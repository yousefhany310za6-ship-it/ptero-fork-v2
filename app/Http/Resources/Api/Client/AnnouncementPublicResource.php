<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Client;

use Illuminate\Http\Request;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;

/**
 * The only announcement shape a normal user ever sees. Deliberately not the
 * admin resource: internal name, audience selector, creator, and status are
 * administration data and are never serialized here.
 *
 * @extends ClientResource<Announcement>
 */
class AnnouncementPublicResource extends ClientResource
{
    public function resourceName(): string
    {
        return 'announcement';
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Announcement $announcement */
        $announcement = $this->resource;

        return [
            'id' => $announcement->id,
            'kind' => $announcement->kind->value,
            'display_type' => $announcement->display_type->value,
            'tag' => $announcement->tag ? [
                'id' => $announcement->tag->id,
                'name' => $announcement->tag->name,
                'color' => $announcement->tag->color,
                'icon' => $announcement->tag->icon,
            ] : null,
            'title' => $announcement->title,
            'body' => $announcement->body,
            'policy' => $announcement->policy->value,
            'require_ack' => $announcement->require_ack,
            'interval_hours' => $announcement->interval_hours,
            'action_label' => $announcement->action_label,
            'action_url' => $announcement->action_url,
            'event_start' => $announcement->event_start?->toIso8601String(),
            'event_end' => $announcement->event_end?->toIso8601String(),
            'publish_at' => $announcement->publish_at?->toIso8601String(),
            'expires_at' => $announcement->expires_at?->toIso8601String(),
            'content_version' => $announcement->content_version,
        ];
    }

    /**
     * The caller's own interaction with this version, appended by the
     * controller — never anyone else's.
     *
     * @return array{acked_at: string|null, dismissed_at: string|null}|null
     */
    public static function interactionState(?AnnouncementInteraction $interaction): ?array
    {
        if ($interaction === null) {
            return null;
        }

        return [
            'acked_at' => $interaction->acked_at?->toIso8601String(),
            'dismissed_at' => $interaction->dismissed_at?->toIso8601String(),
        ];
    }
}
