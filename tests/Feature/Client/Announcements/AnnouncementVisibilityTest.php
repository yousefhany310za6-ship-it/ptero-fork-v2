<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Models\User;

uses(RefreshDatabase::class);

function userActor(): User
{
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    return $user;
}

function visibleIds(): array
{
    return array_column(test()->getJson('/api/client/announcements')->assertOk()->json('data'), 'id');
}

it('never leaks drafts, admin names, audiences, or creators to users', function (): void {
    userActor();
    Announcement::factory()->create(['name' => 'secret internal name', 'audience' => ['type' => 'all']]);

    $response = test()->getJson('/api/client/announcements')->assertOk();
    expect($response->json('data'))->toBeArray()->toHaveCount(0);
    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))
        ->not->toContain('secret internal name')
        ->not->toContain('created_by');
});

it('hides scheduled, expired, paused, and archived rows', function (): void {
    userActor();
    Announcement::factory()->scheduled()->create();
    Announcement::factory()->expired()->create();
    Announcement::factory()->published()->create(['status' => 'paused']);
    Announcement::factory()->published()->create(['status' => 'archived']);

    expect(visibleIds())->toBe([]);
});

it('applies the audience selector server-side', function (): void {
    $me = userActor();
    $other = User::factory()->create();

    $mine = Announcement::factory()->published()->create(['audience' => ['type' => 'users', 'user_ids' => [$me->id]]]);
    Announcement::factory()->published()->create(['audience' => ['type' => 'users', 'user_ids' => [$other->id]]]);

    expect(visibleIds())->toBe([$mine->id]);

    // Out-of-audience announcements are indistinguishable from missing ones.
    $foreign = Announcement::query()->where('id', '!=', $mine->id)->whereJsonContains('audience->user_ids', $other->id)->sole();
    test()->postJson("/api/client/announcements/{$foreign->id}/ack")->assertNotFound();
});

it('once policy: dismiss and ack both stick across requests', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'once']);

    expect(visibleIds())->toBe([$a->id]);
    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertNoContent();
    expect(visibleIds())->toBe([]);

    $b = Announcement::factory()->published()->create(['policy' => 'once']);
    test()->getJson('/api/client/announcements')->assertOk();
    test()->postJson("/api/client/announcements/{$b->id}/ack")->assertNoContent();
    expect(visibleIds())->toBe([]);
});

it('interactions survive logout and a fresh session (stored in the database)', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'once']);
    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertNoContent();

    // Re-authenticate the same account: state must persist server-side.
    Sanctum::actingAs($me->fresh());
    expect(visibleIds())->toBe([]);
});

it('until_ack policy: only explicit acknowledgement hides it', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'until_ack']);

    test()->postJson("/api/client/announcements/{$a->id}/shown")->assertNoContent();
    expect(visibleIds())->toBe([$a->id], 'a mere visit is not an acknowledgement');

    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertNoContent();
    expect(visibleIds())->toBe([$a->id], 'dismiss is not a substitute for ack');

    test()->postJson("/api/client/announcements/{$a->id}/ack")->assertNoContent();
    expect(visibleIds())->toBe([]);
});

it('mandatory critical notices cannot be dismissed before acking', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->critical(requireAck: true)->create(['policy' => 'until_ack']);

    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertForbidden();
    test()->postJson("/api/client/announcements/{$a->id}/ack")->assertNoContent();
    // After the mandated ack, dismissal of future appearances is free.
    expect(AnnouncementInteraction::query()->where('announcement_id', $a->id)->whereNotNull('acked_at')->exists())->toBeTrue();
});

it('every_visit policy: always visible while active, dismiss hides only the current view', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'every_visit']);

    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertNoContent();
    expect(visibleIds())->toBe([$a->id]);
    test()->getJson('/api/client/announcements')->assertOk();
    expect(visibleIds())->toBe([$a->id]);
});

it('interval policy re-opens only after the interval elapses', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'interval', 'interval_hours' => 24]);

    expect(visibleIds())->toBe([$a->id]);
    test()->postJson("/api/client/announcements/{$a->id}/shown")->assertNoContent();
    expect(visibleIds())->toBe([]);

    CarbonImmutable::setTestNow(CarbonImmutable::now()->addHours(25));
    expect(visibleIds())->toBe([$a->id]);
    CarbonImmutable::setTestNow();
});

it('a material edit resurfaces the banner; an admin-only edit never does', function (): void {
    $viewer = User::factory()->create();
    $admin = User::factory()->create(['root_admin' => true]);
    $a = Announcement::factory()->published()->create(['policy' => 'once']);

    Sanctum::actingAs($viewer);
    test()->postJson("/api/client/announcements/{$a->id}/dismiss")->assertNoContent();
    expect(visibleIds())->toBe([]);

    Sanctum::actingAs($admin);
    test()->putJson("/api/admin/announcements/{$a->id}", ['name' => 'renamed internally'])->assertOk();
    Sanctum::actingAs($viewer);
    expect(visibleIds())->toBe([], 'admin-only edits must not resurface anything');

    Sanctum::actingAs($admin);
    test()->putJson("/api/admin/announcements/{$a->id}", ['title' => 'a materially new headline'])->assertOk();
    Sanctum::actingAs($viewer);
    expect(visibleIds())->toBe([$a->id], 'a version bump resurfaces the banner');
});

it('binds interactions to the caller and rejects forged targets', function (): void {
    $victim = User::factory()->create();
    $a = Announcement::factory()->published()->create(['policy' => 'once']);

    // The attack surface has no user id to tamper with: the route takes only
    // the announcement id. Assert no payload variant lets one user write
    // another user's interaction row.
    $me = userActor();
    test()->postJson("/api/client/announcements/{$a->id}/ack", ['user_id' => $victim->id, 'user' => $victim->id])
        ->assertNoContent();

    expect(AnnouncementInteraction::query()->where('user_id', $victim->id)->exists())->toBeFalse()
        ->and(AnnouncementInteraction::query()->where('user_id', $me->id)->whereNotNull('acked_at')->exists())->toBeTrue();
});

it('concurrent upserts converge on one interaction row', function (): void {
    $me = userActor();
    $a = Announcement::factory()->published()->create(['policy' => 'interval', 'interval_hours' => 24]);

    // Simulate parallel impressions: two raw upserts of the same key.
    DB::statement(
        'INSERT INTO announcement_interactions (announcement_id, user_id, version, last_shown_at, show_count, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE show_count = show_count + 1, last_shown_at = VALUES(last_shown_at)',
        [$a->id, $me->id, 1],
    );
    test()->postJson("/api/client/announcements/{$a->id}/shown")->assertNoContent();

    $row = AnnouncementInteraction::query()->sole();
    expect($row->show_count)->toBe(2);
});

it('carries the group rate limiter on the user surface', function (): void {
    $route = collect(app('router')->getRoutes()->getRoutes())
        ->first(fn ($r): bool => $r->getName() === 'api:client.announcements.index');
    expect(implode(',', $route->gatherMiddleware()))->toMatch('/throttle:api.client/');
});
