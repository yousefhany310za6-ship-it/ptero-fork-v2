<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Announcements;

use Pterodactyl\Enum\AnnouncementDisplayPolicy;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;

/**
 * Pure announcement-visibility policy — no repositories, no I/O.
 *
 * Every rule about *whether* a banner is visible lives here and nowhere else,
 * so the same answers are given by the list endpoint, the interaction guards,
 * and the tests. Documented rules (single source of truth):
 *
 * 1. isActive: status must be Published, now >= publish_at (or unset) and
 *    now < expires_at (or unset). Scheduled rows NEVER show early — the
 *    scheduler promotes them once due.
 * 2. Interactions are keyed (announcement, user, content_version). A material
 *    edit bumps the version and the banner resurfaces under the SAME policy.
 *    Admin-only edits (name, audience, timing, policy) never bump it.
 * 3. once: hidden after ack or dismiss for the current version.
 * 4. every_visit: always visible while active; a dismissal hides only the
 *    current view (the client tracks that per mount), an ack suppresses only
 *    when require_ack is set.
 * 5. interval: visible when never shown for this version, or when
 *    now - last_shown_at >= interval_hours. A dismissal also refreshes
 *    last_shown_at, so it acts as a snooze until the next interval.
 * 6. until_ack: visible until acknowledged; dismissal is never a substitute.
 * 7. require_ack banners: dismissing before acknowledging is rejected —
 *    enabling the mandate clears prior dismissals (acks are kept).
 * 8. Suspended/non-active accounts never reach this policy (the controllers
 *    enforce that first); audience 'users' restricts to an explicit id set.
 */
final class AnnouncementVisibilityPolicy
{
    /**
     * Columns whose change counts as a material content edit and therefore
     * bumps content_version. name/audience/policy/timing edits never do.
     */
    public const MATERIAL_FIELDS = [
        'title',
        'body',
        'kind',
        'action_label',
        'action_url',
        'event_start',
        'event_end',
    ];

    public static function isActive(Announcement $a, int $now): bool
    {
        if ($a->status !== AnnouncementStatus::Published) {
            return false;
        }

        if ($a->publish_at !== null && $now < $a->publish_at->getTimestamp()) {
            return false;
        }

        if ($a->expires_at !== null && $now >= $a->expires_at->getTimestamp()) {
            return false;
        }

        return true;
    }

    public static function shouldShow(Announcement $a, ?AnnouncementInteraction $ix, int $now): bool
    {
        if (!self::isActive($a, $now)) {
            return false;
        }

        $mine = ($ix !== null && $ix->version === $a->content_version) ? $ix : null;
        $acked = $mine?->acked_at !== null;
        $dismissed = $mine?->dismissed_at !== null;

        return match ($a->policy) {
            AnnouncementDisplayPolicy::Once => !($acked || $dismissed),
            AnnouncementDisplayPolicy::EveryVisit => $a->require_ack ? !$acked : true,
            AnnouncementDisplayPolicy::Interval => self::intervalVisible($a, $mine, $now, $acked),
            AnnouncementDisplayPolicy::UntilAck => !$acked,
        };
    }

    public static function canDismiss(Announcement $a, ?AnnouncementInteraction $ix): bool
    {
        if (!$a->require_ack) {
            return true;
        }

        $mine = ($ix !== null && $ix->version === $a->content_version) ? $ix : null;

        return $mine?->acked_at !== null;
    }

    /**
     * @param  int  $userId  the authenticated user's id
     */
    public static function audienceMatches(Announcement $a, int $userId): bool
    {
        $audience = $a->audienceSelector();
        if ($audience['type'] === 'all') {
            return true;
        }
        if ($audience['type'] === 'users') {
            return in_array($userId, $audience['user_ids'], true);
        }

        return false;
    }

    /**
     * Action-URL allowlist (defense in depth; validation enforces it too and
     * the client never renders HTML). Allowed: site-relative paths (never
     * protocol-relative //evil) and http(s) URLs. Rejected: javascript:,
     * data:, vbscript:, file:, embedded whitespace/angle brackets.
     */
    public static function isValidActionUrl(string $url): bool
    {
        if ($url === '' || mb_strlen($url) > 500) {
            return false;
        }
        if (preg_match('/[\s<>]/', $url) === 1) {
            return false;
        }
        if (str_starts_with($url, '/')) {
            return !str_starts_with($url, '//');
        }

        $lower = strtolower($url);
        foreach (['javascript:', 'data:', 'vbscript:', 'file:'] as $dangerous) {
            if (str_starts_with($lower, $dangerous)) {
                return false;
            }
        }

        return str_starts_with($lower, 'http://') || str_starts_with($lower, 'https://');
    }

    /**
     * True when the patch contains a material content change. Values are
     * compared after normalisation: enums as their string, dates as instants,
     * blanks as null — so representation noise never counts as an edit.
     *
     * @param  array<string, mixed>  $patch  validated patch (field => new value)
     * @param  Announcement  $current  the row as stored
     */
    public static function isMaterialChange(array $patch, Announcement $current): bool
    {
        foreach (self::MATERIAL_FIELDS as $field) {
            if (!array_key_exists($field, $patch)) {
                continue;
            }
            $changed = in_array($field, ['event_start', 'event_end'], true)
                ? self::instant($patch[$field]) !== self::instant($current->getAttribute($field))
                : self::scalar($patch[$field]) !== self::scalar($current->getAttribute($field));
            if ($changed) {
                return true;
            }
        }

        return false;
    }

    private static function instant(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \DateTimeInterface) {
            return $value->getTimestamp();
        }

        return is_string($value) ? (new \DateTimeImmutable($value))->getTimestamp() : null;
    }

    private static function scalar(mixed $value): ?string
    {
        if ($value instanceof \BackedEnum) {
            return (string) $value->value;
        }
        if ($value === null || $value === '') {
            return null;
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if (is_int($value) || is_float($value) || is_string($value)) {
            return (string) $value;
        }

        return null;
    }

    private static function intervalVisible(Announcement $a, ?AnnouncementInteraction $mine, int $now, bool $acked): bool
    {
        if ($a->require_ack && $acked) {
            return false;
        }

        $last = $mine?->last_shown_at?->getTimestamp();
        if ($last === null) {
            return true;
        }

        $hours = ($a->interval_hours ?? 0) > 0 ? $a->interval_hours : 24;

        return $now - $last >= $hours * 3600;
    }
}
