<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Announcements;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Services\Announcements\AnnouncementVisibilityPolicy;

final class UpdateAnnouncement
{
    /**
     * @return NormalizedValidationRules
     */
    public static function rules(): array
    {
        return array_map(
            /**
             * @param  ValidationRuleSet  $rules
             * @return ValidationRuleSet
             */
            static fn (array $rules): array => ['sometimes', ...$rules],
            AnnouncementRules::fields(),
        );
    }

    /**
     * Applies a partial patch. A material edit (title/body/kind/action/event
     * window) bumps content_version so the banner resurfaces under the same
     * policy; admin-only edits (name, audience, timing, policy, require_ack
     * itself) never do — so a typo fix in internal data cannot spam everyone.
     *
     * @param  array<string, mixed>  $input
     */
    public function update(Announcement $announcement, array $input): Announcement
    {
        if ($announcement->status === AnnouncementStatus::Archived) {
            throw ValidationException::withMessages([
                'status' => 'Archived announcements are read-only.',
            ]);
        }

        $validated = AnnouncementRules::normalize(Validator::validate($input, self::rules()));

        // Switching the policy to interval — by patch or already set — must
        // leave a usable interval behind.
        $policy = $validated['policy'] ?? $announcement->policy->value;
        $intervalHours = array_key_exists('interval_hours', $validated)
            ? $validated['interval_hours']
            : $announcement->interval_hours;
        if ($policy === 'interval' && $intervalHours === null) {
            throw ValidationException::withMessages([
                'interval_hours' => 'interval_hours is required for the interval policy.',
            ]);
        }

        $materialChanged = AnnouncementVisibilityPolicy::isMaterialChange($validated, $announcement);

        return DB::transaction(function () use ($announcement, $validated, $materialChanged): Announcement {
            // `?? null === true` is only reached when require_ack was sent as
            // true, so an explicit array_key_exists here would always hold.
            $enableMandate = ($validated['require_ack'] ?? null) === true
                && $announcement->require_ack === false;

            $announcement->fill($validated);
            if ($materialChanged) {
                /** @var int $baseVersion content_version is an integer column */
                $baseVersion = $announcement->getOriginal('content_version');
                $announcement->content_version = $baseVersion + 1;
            }
            $announcement->save();

            // Enabling the mandate clears prior dismissals (acks are kept) so
            // the explicit-ack rule applies to everyone going forward.
            if ($enableMandate) {
                AnnouncementInteraction::query()
                    ->where('announcement_id', $announcement->id)
                    ->whereNull('acked_at')
                    ->update(['dismissed_at' => null, 'updated_at' => DB::raw('NOW()')]);
            }

            return $announcement->refresh();
        });
    }
}
