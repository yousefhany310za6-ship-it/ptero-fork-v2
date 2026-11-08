<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Models\User;
use Pterodactyl\Support\Network\IpAddressNormalizer;

uses(RefreshDatabase::class);

function banAdmin(): User
{
    $user = User::factory()->create(['root_admin' => true]);
    Sanctum::actingAs($user);

    return $user;
}

function storeBan(array $overrides = []): TestResponse
{
    return test()->postJson('/api/admin/ip-bans', [
        'ip' => '203.0.113.7',
        'reason' => 'Repeated abuse sent from this address.',
        'duration' => 'permanent',
        ...$overrides,
    ]);
}

function banErrorField(TestResponse $response): ?string
{
    /** @var array<string, mixed>|null $error */
    $error = collect($response->json('errors') ?? [])->first();

    return $error['meta']['source_field'] ?? null;
}

it('refuses callers who are not root administrators', function (): void {
    $ban = IpBan::factory()->create();

    Sanctum::actingAs(User::factory()->create(['root_admin' => false]));
    test()->getJson('/api/admin/ip-bans')->assertForbidden();
    storeBan()->assertForbidden();
    test()->deleteJson("/api/admin/ip-bans/$ban->id")->assertForbidden();

    expect(IpBan::query()->count())->toBe(1);
});

it('refuses unauthenticated callers', function (): void {
    test()->getJson('/api/admin/ip-bans')->assertUnauthorized();
    storeBan()->assertUnauthorized();
});

it('stores the normalised bytes and reports the address as text', function (): void {
    $admin = banAdmin();
    $bytes = IpAddressNormalizer::parse('203.0.113.7');
    expect($bytes)->not->toBeNull();

    storeBan()->assertCreated()
        ->assertJsonPath('object', 'ip_ban')
        ->assertJsonPath('attributes.ip', '203.0.113.7')
        ->assertJsonPath('attributes.is_range', false)
        ->assertJsonPath('attributes.is_permanent', true)
        ->assertJsonPath('attributes.created_by', $admin->id);

    $ban = IpBan::query()->sole();
    expect($ban->first_ip)->toBe($bytes->bytes)
        ->and($ban->last_ip)->toBe($bytes->bytes)
        ->and($ban->expires_at)->toBeNull()
        ->and($ban->cidr_label)->toBeNull();
});

it('names only display fields in a ban response', function (): void {
    banAdmin();
    storeBan()->assertCreated();

    /** @var array<string, mixed> $attributes */
    $attributes = test()->getJson('/api/admin/ip-bans')->json('data.0.attributes');

    // The byte bounds are never part of the contract; a reader gets the address text.
    expect(array_keys($attributes))->toBe([
        'id',
        'ip',
        'is_range',
        'reason',
        'is_permanent',
        'expires_at',
        'created_by',
        'created_at',
        'updated_at',
    ]);
});

it('requires an end time for a temporary ban and refuses one already past', function (): void {
    banAdmin();

    $missing = storeBan(['duration' => 'temporary']);
    $missing->assertStatus(422);
    expect(banErrorField($missing))->toBe('expires_at');

    storeBan(['duration' => 'temporary', 'expires_at' => CarbonImmutable::now()->addHour()->toIso8601String()])
        ->assertCreated()
        ->assertJsonPath('attributes.is_permanent', false);

    $past = storeBan(['ip' => '203.0.113.8', 'duration' => 'temporary', 'expires_at' => CarbonImmutable::now()->subHour()->toIso8601String()]);
    $past->assertStatus(422);
    expect(banErrorField($past))->toBe('expires_at');
});

it('reports a malformed address against the ip field', function (string $value): void {
    banAdmin();
    $response = storeBan(['ip' => $value]);
    $response->assertStatus(422);

    expect(banErrorField($response))->toBe('ip');
})->with([
    'a word' => ['not-an-address'],
    'an out of range octet' => ['999.1.1.1'],
    'an octal-looking address' => ['010.0.0.1'],
    'a zone identifier' => ['fe80::1%eth0'],
    'a range with no length' => ['203.0.113.0/'],
    'nothing' => [' '],
]);

it('converges a duplicate range written in another notation onto one row', function (): void {
    banAdmin();
    storeBan()->assertCreated();

    expect(IpBan::query()->count())->toBe(1);

    // The same subject, spelled as an IPv4-mapped address, is the same range: the unique
    // index reports it rather than stacking a second ban to lift separately.
    $duplicate = storeBan(['ip' => '::ffff:203.0.113.7']);
    $duplicate->assertStatus(422);
    expect(banErrorField($duplicate))->toBe('ip')
        ->and(IpBan::query()->count())->toBe(1);
});

it('refuses to ban the loopback the panel answers from', function (): void {
    banAdmin();

    foreach (['127.0.0.1', '127.0.0.0/8', '::1'] as $value) {
        $response = storeBan(['ip' => $value]);
        $response->assertStatus(422);
        expect(banErrorField($response))->toBe('ip');
    }

    expect(IpBan::query()->count())->toBe(0);
});

it('makes an administrator confirm a range wide enough to catch innocent accounts', function (): void {
    banAdmin();

    // A /16 is the widest range that needs no second thought: it is 65536 hosts.
    storeBan(['ip' => '198.18.0.0/16'])->assertCreated();

    $broad = storeBan(['ip' => '198.16.0.0/12', 'reason' => 'A whole provider block sending abuse.']);
    $broad->assertStatus(422);
    /** @var array<string, mixed>|null $error */
    $error = collect($broad->json('errors') ?? [])->first();
    expect($error['meta']['source_field'] ?? null)->toBe('ip')
        ->and($error['detail'] ?? null)->toMatch('/65536 hosts/');

    storeBan(['ip' => '198.16.0.0/12', 'reason' => 'A whole provider block sending abuse.', 'acknowledge_broad' => true])
        ->assertCreated()
        ->assertJsonPath('attributes.is_range', true)
        ->assertJsonPath('attributes.ip', '198.16.0.0/12');
});

it('lists bans, finds the one covering an address, and filters by state', function (): void {
    banAdmin();

    $host = IpBan::factory()->create(['reason' => 'Spam from one host.']);
    $range = IpBan::factory()->range('192.0.2.0/24')->temporary(CarbonImmutable::now()->addWeek())->create(['reason' => 'Botnet range.']);
    IpBan::factory()->range('198.51.100.0/24')->expired()->create(['reason' => 'Old incident.']);

    test()->getJson('/api/admin/ip-bans')->assertOk()->assertJsonCount(3, 'data');

    // The question an administrator asks when somebody reports being unable to sign in,
    // and it is answered whichever notation the address arrives in.
    test()->getJson('/api/admin/ip-bans?filter[ip]=192.0.2.7')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.attributes.id', $range->id);
    test()->getJson('/api/admin/ip-bans?filter[ip]=::ffff:192.0.2.7')->assertOk()
        ->assertJsonPath('data.0.attributes.id', $range->id);
    test()->getJson('/api/admin/ip-bans?filter[ip]=203.0.113.99')->assertOk()->assertJsonCount(0, 'data');

    test()->getJson('/api/admin/ip-bans?filter[status]=permanent')->assertOk()
        ->assertJsonPath('data.0.attributes.id', $host->id);
    test()->getJson('/api/admin/ip-bans?filter[status]=expired')->assertOk()->assertJsonCount(1, 'data');
    test()->getJson('/api/admin/ip-bans?filter[status]=active')->assertOk()->assertJsonCount(2, 'data');
    test()->getJson('/api/admin/ip-bans?filter[reason]=Botnet')->assertOk()->assertJsonCount(1, 'data');

    test()->getJson('/api/admin/ip-bans?per_page=2')->assertOk()->assertJsonCount(2, 'data')
        ->assertJsonPath('meta.pagination.total', 3);
});

it('rejects a malformed filter rather than quietly listing everything', function (): void {
    banAdmin();
    IpBan::factory()->create();

    $response = test()->getJson('/api/admin/ip-bans?filter[ip]=nonsense');
    $response->assertStatus(422);

    expect(banErrorField($response))->toBe('filter.ip');

    // A status the panel does not know is a bad question, not a server fault: the scope that
    // answers it is bound straight to the query string, so it has to say so in those terms.
    $status = test()->getJson('/api/admin/ip-bans?filter[status]=nonsense')->assertStatus(422);
    expect(banErrorField($status))->toBe('filter.status');
});

it('lifts a ban and audits both halves', function (): void {
    $admin = banAdmin();
    $id = storeBan()->json('attributes.id');

    test()->deleteJson("/api/admin/ip-bans/$id")->assertNoContent();

    expect(IpBan::query()->count())->toBe(0)
        ->and(DB::table('activity_logs')->where('event', 'admin:ip-ban.create')->exists())->toBeTrue()
        ->and(DB::table('activity_logs')->where('event', 'admin:ip-ban.delete')->exists())->toBeTrue();

    /** @var array{actor_type: string, actor_id: int, properties: string} $row */
    $row = (array) DB::table('activity_logs')->where('event', 'admin:ip-ban.delete')->sole();
    expect($row['actor_type'])->toBe('user')
        ->and($row['actor_id'])->toBe($admin->id)
        ->and(json_decode($row['properties'], true, flags: JSON_THROW_ON_ERROR))->toBeArray();
});

it('keeps credentials out of the audit trail', function (): void {
    banAdmin();
    storeBan(['reason' => 'Password spraying, api key leak from this host.'])->assertCreated();

    /** @var string $properties */
    $properties = (string) DB::table('activity_logs')->where('event', 'admin:ip-ban.create')->value('properties');
    $decoded = json_decode($properties, true, flags: JSON_THROW_ON_ERROR);

    // The audit records what was banned, not the reason text — which is where a
    // free-form field would eventually carry a password or a token.
    expect($decoded)->toBeArray()
        ->and($properties)->not->toMatch('/password|api key|token/i');
});

it('answers an unknown ban with 404', function (): void {
    banAdmin();
    test()->deleteJson('/api/admin/ip-bans/424242')->assertNotFound();
});
