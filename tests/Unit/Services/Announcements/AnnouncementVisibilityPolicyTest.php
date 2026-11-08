<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Pterodactyl\Enum\AnnouncementDisplayPolicy;
use Pterodactyl\Enum\AnnouncementKind;
use Pterodactyl\Enum\AnnouncementStatus;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Services\Announcements\AnnouncementVisibilityPolicy;

/**
 * Pure unit coverage for the single source of truth on banner visibility.
 * No database, no HTTP — the feature suites exercise the same rules through
 * the API, which is what keeps backend and client answers from diverging.
 */
function ann(array $overrides = []): Announcement
{
    return Announcement::factory()->make([
        'status' => AnnouncementStatus::Published,
        'kind' => AnnouncementKind::Info,
        'policy' => AnnouncementDisplayPolicy::Once,
        'require_ack' => false,
        'content_version' => 1,
        ...$overrides,
    ]);
}

function ix(array $overrides = []): AnnouncementInteraction
{
    return (new AnnouncementInteraction())->forceFill([
        'version' => 1,
        'last_shown_at' => null,
        'acked_at' => null,
        'dismissed_at' => null,
        ...$overrides,
    ]);
}


it('treats every non-published status as inactive', function (): void {
    foreach (['draft', 'scheduled', 'paused', 'archived'] as $status) {
        expect(AnnouncementVisibilityPolicy::isActive(ann(['status' => $status]), time()))
            ->toBeFalse($status);
    }
    expect(AnnouncementVisibilityPolicy::isActive(ann(), time()))->toBeTrue();
});

it('honours the publish/expiry window', function (): void {
    expect(AnnouncementVisibilityPolicy::isActive(
        ann(['publish_at' => CarbonImmutable::now()->addHour()]), time(),
    ))->toBeFalse();

    expect(AnnouncementVisibilityPolicy::isActive(
        ann(['expires_at' => CarbonImmutable::now()->subSecond()]), time(),
    ))->toBeFalse();

    expect(AnnouncementVisibilityPolicy::isActive(ann(), time()))->toBeTrue();
});

it('once: hides after ack or dismiss, resurfaces on a version bump', function (): void {
    $a = ann();
    expect(AnnouncementVisibilityPolicy::shouldShow($a, null, time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow($a, ix(['dismissed_at' => CarbonImmutable::now()]), time()))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::shouldShow($a, ix(['acked_at' => CarbonImmutable::now()]), time()))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::shouldShow(
            ann(['content_version' => 2]), ix(['dismissed_at' => CarbonImmutable::now(), 'version' => 1]), time(),
        ))->toBeTrue();
});

it('every_visit: stays visible, an ack only suppresses when mandatory', function (): void {
    $a = ann(['policy' => AnnouncementDisplayPolicy::EveryVisit]);
    $shown = ix(['dismissed_at' => CarbonImmutable::now(), 'last_shown_at' => CarbonImmutable::now()]);
    expect(AnnouncementVisibilityPolicy::shouldShow($a, null, time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow($a, $shown, time()))->toBeTrue();

    $m = ann(['policy' => AnnouncementDisplayPolicy::EveryVisit, 'require_ack' => true]);
    expect(AnnouncementVisibilityPolicy::shouldShow($m, $shown, time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow(
            $m, ix(['acked_at' => CarbonImmutable::now()]), time(),
        ))->toBeFalse();
});

it('interval: reopens only after the window elapses and old versions do not suppress', function (): void {
    $a = ann(['policy' => AnnouncementDisplayPolicy::Interval, 'interval_hours' => 24]);
    expect(AnnouncementVisibilityPolicy::shouldShow($a, null, time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow(
            $a, ix(['last_shown_at' => CarbonImmutable::now()->subHour()]), time(),
        ))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::shouldShow(
            $a, ix(['last_shown_at' => CarbonImmutable::now()->subHours(25)]), time(),
        ))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow(
            ann(['policy' => AnnouncementDisplayPolicy::Interval, 'interval_hours' => 24, 'content_version' => 2]),
            ix(['last_shown_at' => CarbonImmutable::now()]), time(),
        ))->toBeTrue();
});

it('until_ack: acknowledgement is the only exit, dismiss never counts', function (): void {
    $a = ann(['policy' => AnnouncementDisplayPolicy::UntilAck]);
    expect(AnnouncementVisibilityPolicy::shouldShow($a, null, time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow($a, ix(['dismissed_at' => CarbonImmutable::now()]), time()))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::shouldShow($a, ix(['acked_at' => CarbonImmutable::now()]), time()))->toBeFalse();
});

it('gates dismissal on acknowledgement when the banner is mandatory', function (): void {
    $free = ann(['require_ack' => false]);
    expect(AnnouncementVisibilityPolicy::canDismiss($free, null))->toBeTrue();

    $m = ann(['require_ack' => true]);
    expect(AnnouncementVisibilityPolicy::canDismiss($m, null))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::canDismiss($m, ix(['dismissed_at' => CarbonImmutable::now()])))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::canDismiss($m, ix(['acked_at' => CarbonImmutable::now()])))->toBeTrue();
});

it('matches audiences without leaking to others', function (): void {
    expect(AnnouncementVisibilityPolicy::audienceMatches(ann(), 7))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::audienceMatches(
            ann(['audience' => ['type' => 'users', 'user_ids' => [7]]]), 7,
        ))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::audienceMatches(
            ann(['audience' => ['type' => 'users', 'user_ids' => [8]]]), 7,
        ))->toBeFalse();
});

it('accepts only safe action urls', function (): void {
    foreach (['/dashboard', '/', 'https://status.example.com', 'http://example.com/x'] as $ok) {
        expect(AnnouncementVisibilityPolicy::isValidActionUrl($ok))->toBeTrue($ok);
    }
    foreach (['', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'vbscript:x', 'file:///etc/passwd', '//evil.com', '/has space', '/has<tag>'] as $bad) {
        expect(AnnouncementVisibilityPolicy::isValidActionUrl($bad))->toBeFalse($bad ?: '(empty)');
    }
});

it('counts only content fields as material changes', function (): void {
    $stored = ann([
        'title' => 'T', 'body' => 'B', 'kind' => AnnouncementKind::Warning,
        'action_url' => '/status', 'event_start' => CarbonImmutable::parse('2026-11-05 10:00:00'),
    ]);

    // Admin-only fields never bump.
    expect(AnnouncementVisibilityPolicy::isMaterialChange(['name' => 'new name'], $stored))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['audience' => ['type' => 'users', 'user_ids' => [3]]], $stored))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['publish_at' => '2026-12-01 00:00:00'], $stored))->toBeFalse();

    // Identical content in a different representation is not an edit.
    expect(AnnouncementVisibilityPolicy::isMaterialChange(['title' => 'T'], $stored))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['kind' => 'warning'], $stored))->toBeFalse()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['event_start' => '2026-11-05 10:00:00'], $stored))->toBeFalse();

    // Real content edits are.
    expect(AnnouncementVisibilityPolicy::isMaterialChange(['title' => 'T2'], $stored))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['body' => 'B!'], $stored))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['action_url' => 'https://status.example.com'], $stored))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['event_start' => '2026-11-06 10:00:00'], $stored))->toBeTrue()
        ->and(AnnouncementVisibilityPolicy::isMaterialChange(['event_end' => '2026-11-07 10:00:00'], $stored))->toBeTrue();
});
