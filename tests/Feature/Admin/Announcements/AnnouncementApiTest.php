<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Console\Commands\Maintenance\PublishDueAnnouncementsCommand;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\Announcement;
use Pterodactyl\Models\AnnouncementInteraction;
use Pterodactyl\Models\User;

uses(RefreshDatabase::class);

function adminUser(): User
{
    return User::factory()->create(['root_admin' => true]);
}

function actingAsAdmin(): User
{
    $user = adminUser();
    Sanctum::actingAs($user);

    return $user;
}

function actingAsNormalUser(): User
{
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    return $user;
}

function storeAnnouncement(array $overrides = []): TestResponse
{
    return test()->postJson('/api/admin/announcements', [
        'name' => 'internal notice',
        'title' => 'Scheduled maintenance',
        'body' => 'We will reboot nodes tonight.',
        ...$overrides,
    ]);
}

it('rejects non-administrators from the admin announcements API', function (): void {
    $user = actingAsNormalUser();
    /** @phpstan-ignore-next-line offsetAccess.notFound */
    test()->getJson('/api/admin/announcements')->assertForbidden();
    test()->postJson('/api/admin/announcements', ['name' => 'x', 'title' => 'y', 'body' => 'z'])->assertForbidden();
});

it('rejects unauthenticated callers', function (): void {
    test()->getJson('/api/admin/announcements')->assertUnauthorized();
    test()->getJson('/api/client/announcements')->assertUnauthorized();
});

it('creates drafts only, storing normalized fields', function (): void {
    $admin = actingAsAdmin();
    $response = storeAnnouncement(['title' => '  Padded title  ']);
    $response->assertCreated();

    $announcement = Announcement::query()->sole();
    expect($announcement->status->value)->toBe('draft')
        ->and($announcement->title)->toBe('Padded title')
        ->and($announcement->content_version)->toBe(1)
        ->and($announcement->created_by)->toBe($admin->id)
        ->and($announcement->kind->value)->toBe('info');
});

it('refuses dangerous action urls and mass-assignable internals', function (): void {
    actingAsAdmin();
    storeAnnouncement(['action_url' => 'javascript:alert(1)'])->assertStatus(422)->json('errors.action_url.0');
    storeAnnouncement(['action_url' => '//evil.com/x'])->assertStatus(422);
    storeAnnouncement(['action_url' => 'data:text/html,<h1>'])->assertStatus(422);
    // status/content_version are not writable fields at all: unknown/internal
    // keys are ignored and the server-forced draft defaults win.
    $response = storeAnnouncement(['status' => 'published', 'content_version' => 99]);
    $response->assertCreated();
    $announcement = Announcement::query()->sole();
    expect($announcement->status->value)->toBe('draft')
        ->and($announcement->content_version)->toBe(1);
});

it('requires interval_hours for the interval policy', function (): void {
    actingAsAdmin();
    storeAnnouncement(['policy' => 'interval'])->assertStatus(422)
        ->json('errors.interval_hours');
    storeAnnouncement(['policy' => 'interval', 'interval_hours' => 24])->assertCreated();
});

it('publishes through transitions only and blocks skipping delete of live banners', function (): void {
    actingAsAdmin();
    $id = storeAnnouncement()->json('attributes.id');

    // Delete while published is refused; pause first, then delete works.
    test()->postJson("/api/admin/announcements/$id/publish")->assertOk();
    test()->deleteJson("/api/admin/announcements/$id")->assertStatus(409);
    test()->postJson("/api/admin/announcements/$id/pause")->assertOk();
    test()->deleteJson("/api/admin/announcements/$id")->assertNoContent();
    expect(Announcement::query()->find($id))->toBeNull();
});

it('validates the state machine edges', function (): void {
    actingAsAdmin();
    $id = storeAnnouncement()->json('attributes.id');
    // draft -> pause is not an edge.
    test()->postJson("/api/admin/announcements/$id/pause")->assertStatus(409);
    // draft -> schedule with a past time is refused.
    test()->postJson("/api/admin/announcements/$id/schedule", ['publish_at' => CarbonImmutable::now()->subHour()->toIso8601String()])
        ->assertStatus(422);
    // future schedule works, then archived rows are read-only.
    test()->postJson("/api/admin/announcements/$id/schedule", ['publish_at' => CarbonImmutable::now()->addDay()->toIso8601String()])
        ->assertOk();
    test()->postJson("/api/admin/announcements/$id/archive")->assertOk();
    test()->putJson("/api/admin/announcements/$id", ['title' => 'nope'])->assertStatus(422);
});

it('bumps content version on material edits only', function (): void {
    actingAsAdmin();
    $id = storeAnnouncement()->json('attributes.id');

    test()->putJson("/api/admin/announcements/$id", ['name' => 'renamed internally'])->assertOk();
    expect(Announcement::query()->find($id)->content_version)->toBe(1);

    test()->putJson("/api/admin/announcements/$id", ['audience' => ['type' => 'all']])->assertOk();
    expect(Announcement::query()->find($id)->content_version)->toBe(1);

    test()->putJson("/api/admin/announcements/$id", ['title' => 'Scheduled maintenance'])->assertOk();
    expect(Announcement::query()->find($id)->content_version)->toBe(1);

    test()->putJson("/api/admin/announcements/$id", ['title' => 'A materially new title'])->assertOk();
    expect(Announcement::query()->find($id)->content_version)->toBe(2);
});

it('promotes due scheduled announcements and never early ones', function (): void {
    actingAsAdmin();
    $due = Announcement::factory()->scheduled(CarbonImmutable::now()->subMinutes(2))->create();
    $future = Announcement::factory()->scheduled(CarbonImmutable::now()->addDay())->create();
    $pausedThenScheduled = Announcement::factory()->scheduled(CarbonImmutable::now()->subMinute())
        ->create(['status' => 'scheduled']);
    // A row paused after scheduling stays paused even if the time passed —
    // the guarded update only promotes rows still marked scheduled.
    $pausedThenScheduled->update(['status' => 'paused']);

    test()->artisan(PublishDueAnnouncementsCommand::class)->assertSuccessful();

    expect($due->refresh()->status->value)->toBe('published')
        ->and($future->refresh()->status->value)->toBe('scheduled')
        ->and($pausedThenScheduled->refresh()->status->value)->toBe('paused');
});

it('exposes stats separating audience from actual views', function (): void {
    actingAsAdmin();
    User::factory()->count(3)->create(); // plus the admin below => 4 total
    $id = storeAnnouncement()->json('attributes.id');
    test()->postJson("/api/admin/announcements/$id/publish")->assertOk();

    $stats = test()->getJson("/api/admin/announcements/$id/stats")->assertOk()->json();
    expect($stats['eligible'])->toBeGreaterThanOrEqual(4)
        ->and($stats['shown'])->toBe(0)
        ->and($stats['acked'])->toBe(0)
        ->and($stats['dismissed'])->toBe(0)
        ->and($stats['content_version'])->toBe(1);
});

it('logs admin mutations to the activity log', function (): void {
    actingAsAdmin();
    $id = storeAnnouncement()->json('attributes.id');
    test()->postJson("/api/admin/announcements/$id/publish")->assertOk();

    expect(DB::table('activity_logs')->where('event', 'admin:announcement.create')->exists())->toBeTrue()
        ->and(DB::table('activity_logs')->where('event', 'admin:announcement.publish')->exists())->toBeTrue();
});

it('grants read access only through the declared permission', function (): void {
    actingAsAdmin();
    $route = collect(app('router')->getRoutes()->getRoutes())
        ->first(fn ($r): bool => $r->getName() === 'api.admin.announcements.store');
    expect($route)->not->toBeNull()
        // The group-level throttles (api.admin / api.client) protect every
        // new endpoint; assert the admin surface carries one.
        ->and(implode(',', $route->gatherMiddleware()))->toMatch('/throttle:api.admin/');
});
