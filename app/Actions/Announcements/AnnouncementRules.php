<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Announcements;

use Illuminate\Validation\Rule;
use Pterodactyl\Enum\AnnouncementDisplayPolicy;
use Pterodactyl\Enum\AnnouncementDisplayType;
use Pterodactyl\Enum\AnnouncementKind;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Rules\ValidAnnouncementActionUrl;

/**
 * Field rules shared by create/update so the API surface validates one way.
 * status and content_version are deliberately absent: they are owned by the
 * transition actions and the version bump, never writable by a client —
 * which is also the mass-assignment boundary.
 */
final class AnnouncementRules
{
    /**
     * @return NormalizedValidationRules
     */
    public static function fields(): array
    {
        return [
            'name' => ['required', 'string', 'between:1,100'],
            'title' => ['required', 'string', 'between:1,140'],
            // Plain text, rendered as text by the client. No HTML pipeline exists.
            'body' => ['required', 'string', 'between:1,4000'],
            'kind' => ['nullable', Rule::enum(AnnouncementKind::class)],
            'display_type' => ['nullable', Rule::enum(AnnouncementDisplayType::class)],
            // The tag brands the notice; deleting a tag unbrands rather than breaks.
            'tag_id' => ['nullable', 'integer', 'exists:announcement_tags,id'],
            'policy' => ['nullable', Rule::enum(AnnouncementDisplayPolicy::class)],
            'require_ack' => ['nullable', 'boolean'],
            'interval_hours' => ['nullable', 'integer', 'between:1,2160', 'required_if:policy,interval'],
            'audience' => ['nullable', 'array'],
            'audience.type' => ['required_with:audience', Rule::in(['all', 'users'])],
            'audience.user_ids' => ['required_if:audience.type,users', 'array', 'max:500'],
            'audience.user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            'action_label' => ['nullable', 'string', 'max:40', 'required_with:action_url'],
            'action_url' => ['nullable', 'string', 'max:500', new ValidAnnouncementActionUrl],
            'event_start' => ['nullable', 'date'],
            'event_end' => ['nullable', 'date', 'after:event_start'],
            'publish_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date', 'after:publish_at'],
        ];
    }

    /**
     * Turn a validated payload into stored attributes: trimmed, blanks to
     * null, audience normalised. Date strings pass through — the model casts
     * converts them on save.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function normalize(array $validated): array
    {
        foreach (['name', 'title', 'body'] as $field) {
            if (isset($validated[$field]) && is_string($validated[$field])) {
                $validated[$field] = trim($validated[$field]);
            }
        }

        foreach (['kind', 'display_type', 'tag_id', 'policy', 'action_label', 'action_url', 'interval_hours', 'require_ack', 'event_start', 'event_end', 'publish_at', 'expires_at'] as $field) {
            if (array_key_exists($field, $validated) && ($validated[$field] === '' || $validated[$field] === null)) {
                $validated[$field] = null;
            }
        }

        if (array_key_exists('require_ack', $validated)) {
            $validated['require_ack'] = filter_var($validated['require_ack'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
        }

        if (array_key_exists('audience', $validated)) {
            $audience = is_array($validated['audience']) ? $validated['audience'] : [];
            $type = $audience['type'] ?? null;

            $validated['audience'] = match (true) {
                $type === 'users' => ['type' => 'users', 'user_ids' => self::normaliseUserIds($audience['user_ids'] ?? [])],
                $type === 'all' => ['type' => 'all'],
                default => null,
            };
        }

        return $validated;
    }

    /**
     * Coerce an audience id list to a de-duplicated list of ints, ignoring
     * anything non-numeric (validation already rejected those; this keeps the
     * stored payload canonical).
     *
     * @param  mixed  $ids
     * @return list<int>
     */
    private static function normaliseUserIds(mixed $ids): array
    {
        $userIds = [];
        foreach (is_array($ids) ? $ids : [] as $id) {
            if (is_numeric($id)) {
                $userIds[] = (int) $id;
            }
        }

        return array_values(array_unique($userIds));
    }
}
