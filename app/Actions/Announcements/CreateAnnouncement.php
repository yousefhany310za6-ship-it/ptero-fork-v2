<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Announcements;

use Illuminate\Support\Facades\Validator;
use Pterodactyl\Models\Announcement;

final class CreateAnnouncement
{
    /**
     * @return NormalizedValidationRules
     */
    public static function rules(): array
    {
        return AnnouncementRules::fields();
    }

    /**
     * New announcements always start as drafts; publishing is a separate,
     * audited transition so content can never skip review by accident.
     *
     * @param  array<string, mixed>  $input
     */
    public function create(array $input, int $actorId): Announcement
    {
        $validated = Validator::validate($input, self::rules());
        $validated = AnnouncementRules::normalize($validated);

        return Announcement::query()->create([
            ...$validated,
            'kind' => $validated['kind'] ?? 'info',
            'display_type' => $validated['display_type'] ?? 'banner',
            'policy' => $validated['policy'] ?? 'once',
            'require_ack' => (bool) ($validated['require_ack'] ?? false),
            'audience' => $validated['audience'] ?? ['type' => 'all'],
            'status' => 'draft',
            'content_version' => 1,
            'created_by' => $actorId,
        ]);
    }
}
