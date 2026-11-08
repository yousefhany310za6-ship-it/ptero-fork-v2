<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Announcements;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Announcements\GetAnnouncementsRequest;
use Pterodactyl\Http\Resources\Api\Client\AnnouncementPublicResource;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Services\Announcements\AnnouncementVisibilityPolicy;
use Pterodactyl\Services\Announcements\RecordAnnouncementInteraction;

/**
 * User-facing announcements. Visibility, audience, timing, mandates, and
 * repeat policy are all decided here in the database-backed policy — the
 * client only renders what this returns and reports interactions.
 * Drafts, internal names, audience selectors, and creator data never leave
 * the admin surface.
 */
class AnnouncementController extends ClientApiController
{
    public function index(GetAnnouncementsRequest $request): JsonResponse
    {
        $user = $request->user();
        $now = CarbonImmutable::now()->getTimestamp();

        $announcements = Announcement::query()
            ->with('tag')
            ->where('status', AnnouncementStatus::Published->value)
            ->get();

        $interactions = AnnouncementInteraction::query()
            ->where('user_id', $user->id)
            ->whereIn('announcement_id', $announcements->pluck('id')->all())
            ->get()
            ->keyBy('announcement_id');

        $visible = [];
        foreach ($announcements as $announcement) {
            $interaction = $interactions->get($announcement->id);
            if (!AnnouncementVisibilityPolicy::audienceMatches($announcement, $user->id)) {
                continue;
            }
            if (!AnnouncementVisibilityPolicy::shouldShow($announcement, $interaction, $now)) {
                continue;
            }
            $visible[] = [$announcement, $interaction];
        }

        // Critical first, then newest published — critical notices are never
        // silently buried under routine ones.
        usort($visible, static function (array $a, array $b): int {
            return $a[0]->kind->rank() <=> $b[0]->kind->rank()
                ?: ($b[0]->published_at?->getTimestamp() ?? 0) <=> ($a[0]->published_at?->getTimestamp() ?? 0);
        });

        $data = array_map(static function (array $pair) use ($request): array {
            [$announcement, $interaction] = $pair;
            $attributes = AnnouncementPublicResource::make($announcement)->toArray($request);
            $attributes['interaction'] = AnnouncementPublicResource::interactionState($interaction);

            return $attributes;
        }, $visible);

        return new JsonResponse(['data' => $data]);
    }

    /**
     * Report an impression. Idempotent per visit, never a read receipt.
     */
    public function shown(
        GetAnnouncementsRequest $request,
        Announcement $announcement,
        RecordAnnouncementInteraction $interactions,
    ): JsonResponse {
        $interactions->shown($announcement, $request->user());

        return new JsonResponse(null, JsonResponse::HTTP_NO_CONTENT);
    }

    /**
     * Explicit "I have read this" for mandates and until_ack banners.
     */
    public function ack(
        GetAnnouncementsRequest $request,
        Announcement $announcement,
        RecordAnnouncementInteraction $interactions,
    ): JsonResponse {
        $interactions->ack($announcement, $request->user());

        return new JsonResponse(null, JsonResponse::HTTP_NO_CONTENT);
    }

    /**
     * Hide the banner; rejected with 403 while an explicit acknowledgement is
     * still outstanding.
     */
    public function dismiss(
        GetAnnouncementsRequest $request,
        Announcement $announcement,
        RecordAnnouncementInteraction $interactions,
    ): JsonResponse {
        $interactions->dismiss($announcement, $request->user());

        return new JsonResponse(null, JsonResponse::HTTP_NO_CONTENT);
    }
}
