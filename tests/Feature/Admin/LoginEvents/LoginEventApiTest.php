<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Sequence;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;

uses(RefreshDatabase::class);

function historyAdmin(): User
{
    $user = User::factory()->create(['root_admin' => true]);
    Sanctum::actingAs($user);

    return $user;
}

function expectDenied(TestResponse $response): void
{
    $response->assertForbidden();
    expect(LoginEvent::query()->count())->not->toBe(0);
}

it('refuses callers who are not root administrators', function (): void {
    LoginEvent::factory()->count(2)->create();

    // An administrator role that is not root gets no part of this: the history is the
    // panel's evidence about who signed in from where, including about other administrators.
    Sanctum::actingAs(User::factory()->create(['root_admin' => false]));

    expectDenied(test()->getJson('/api/admin/login-events'));

    $subject = User::factory()->create();
    LoginEvent::factory()->outcome(LoginEventOutcome::Success)->against($subject)->create();

    expectDenied(test()->getJson("/api/admin/users/$subject->id/ip-history"));
});

it('refuses unauthenticated callers', function (): void {
    LoginEvent::factory()->create();

    test()->getJson('/api/admin/login-events')->assertUnauthorized();
    test()->getJson('/api/admin/users/1/ip-history')->assertUnauthorized();
});

it('lists attempts newest first and reports the address as text', function (): void {
    historyAdmin();
    $older = LoginEvent::factory()->from('203.0.113.1')->create();
    $newer = LoginEvent::factory()->from('198.51.100.9')->create();

    test()->getJson('/api/admin/login-events')
        ->assertOk()
        ->assertJsonPath('object', 'list')
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.attributes.ip', '198.51.100.9')
        ->assertJsonPath('data.0.attributes.id', $newer->id)
        ->assertJsonPath('data.1.attributes.id', $older->id)
        ->assertJsonPath('data.1.attributes.outcome', 'failed');
});

it('finds the same attempts whichever notation the address is written in', function (string $spelling): void {
    historyAdmin();
    LoginEvent::factory()->from('203.0.113.8')->create();
    LoginEvent::factory()->from('198.51.100.8')->create();

    test()->getJson('/api/admin/login-events?filter[ip]='.urlencode($spelling))
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.attributes.ip', '203.0.113.8');
})->with([
    'the address as stored' => ['203.0.113.8'],
    'as an ipv4 mapped address' => ['::ffff:203.0.113.8'],
    'in hexadecimal groups' => ['::ffff:cb00:7108'],
]);

it('refuses a range in the ip filter instead of guessing what was meant', function (): void {
    historyAdmin();
    LoginEvent::factory()->from('203.0.113.8')->create();

    $response = test()->getJson('/api/admin/login-events?filter[ip]=203.0.113.0%2F24');
    $response->assertStatus(422);

    /** @var array<string, mixed>|null $error */
    $error = collect($response->json('errors') ?? [])->first();
    expect($error['meta']['source_field'] ?? null)->toBe('filter.ip');
});

it('narrows the list to one kind of attempt', function (): void {
    historyAdmin();
    LoginEvent::factory()->outcome(LoginEventOutcome::Success)->create();
    $failed = LoginEvent::factory()->outcome(LoginEventOutcome::Failed)->create();

    test()->getJson('/api/admin/login-events?filter[outcome]=failed')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.attributes.id', $failed->id);

    $unknown = test()->getJson('/api/admin/login-events?filter[outcome]=nonsense');
    $unknown->assertStatus(422);

    /** @var array<string, mixed>|null $error */
    $error = collect($unknown->json('errors') ?? [])->first();
    expect($error['meta']['source_field'] ?? null)->toBe('filter.outcome');
});

it('returns one account\'s history without the attempts of anyone else', function (): void {
    historyAdmin();
    $subject = User::factory()->create();
    $other = User::factory()->create();

    LoginEvent::factory()->against($subject)->from('203.0.113.20')->create();
    $second = LoginEvent::factory()->outcome(LoginEventOutcome::Success)->against($subject)->from('198.51.100.20')->create();
    LoginEvent::factory()->against($other)->create();
    // An attempt that only ever typed this account's username, and failed on the password, is
    // not this account signing in from somewhere new.
    LoginEvent::factory()->against(null, $subject->username)->create();

    $response = test()->getJson("/api/admin/users/$subject->id/ip-history");
    $response
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.attributes.id', $second->id)
        ->assertJsonPath('data.0.attributes.outcome', 'success')
        ->assertJsonPath('data.1.attributes.outcome', 'failed');

    $accounts = collect($response->json('data'))
        ->map(fn (array $item): ?string => $item['attributes']['user_uuid'] ?? null);
    expect($accounts->unique()->all())->toBe([$subject->uuid]);
});

it('names the account an attempt was aimed at without exposing anything else about it', function (): void {
    historyAdmin();
    $user = User::factory()->create(['username' => 'someone', 'email' => 'secret-person@example.com']);
    LoginEvent::factory()->outcome(LoginEventOutcome::Success)->against($user)->create();

    $response = test()->getJson('/api/admin/login-events')->assertOk();
    $attributes = $response->json('data.0.attributes');

    expect($attributes['user_id'])->toBe($user->id)
        ->and($attributes['user_uuid'])->toBe($user->uuid)
        ->and($attributes['outcome'])->toBe('success')
        ->and($attributes['created_at'])->not->toBeNull()
        ->and($attributes)->not->toHaveKey('email')
        ->and($attributes)->not->toHaveKey('password');

    // The address is the subject of this table; an email address is not, and it is what an
    // attacker with a leaked history export would be after next.
    expect(json_encode($response->json(), JSON_THROW_ON_ERROR))
        ->not->toContain('secret-person@example.com')
        ->not->toContain('$2y$');
});

it('prunes the history to the retention window it was given', function (): void {
    $kept = LoginEvent::factory()->create();

    $outdated = LoginEvent::factory()->create();
    config(['pterodactyl.security.login_ip_retention_days' => 30]);
    // created_at is not mass-assignable, which is the point of writing it directly here: the
    // panel never decides for itself when an attempt happened.
    $outdated->forceFill(['created_at' => CarbonImmutable::now()->subDays(31)])->save();

    expect((new LoginEvent())->prunable()->pluck('id')->all())->toBe([$outdated->id])
        ->and(LoginEvent::query()->whereKey($kept->id)->exists())->toBeTrue();
});

it('names the accounts that share an address, and the names that were tried at it', function (): void {
    historyAdmin();
    $shared = User::factory()->create(['username' => 'shared-account']);
    $other = User::factory()->create(['username' => 'other-account']);

    LoginEvent::factory()->outcome(LoginEventOutcome::Success)->against($shared)->from('203.0.113.30')->create();
    LoginEvent::factory()->against($shared)->from('203.0.113.30')->create();
    LoginEvent::factory()->outcome(LoginEventOutcome::Success)->against($other)->from('203.0.113.30')->create();
    // The name that answers to no account is still a fact about this address.
    LoginEvent::factory()->against(null, 'guessed-name')->from('203.0.113.30')->create();
    LoginEvent::factory()->against($shared)->from('198.51.100.30')->create();

    $response = test()->getJson('/api/admin/login-events/associated-accounts?ip='.urlencode('::ffff:203.0.113.30'));
    $response->assertOk()->assertJsonPath('data.ip', '203.0.113.30')->assertJsonPath('data.truncated', false);

    $accounts = collect($response->json('data.accounts'));
    $byName = $accounts->keyBy('username_attempted');

    expect($accounts)->toHaveCount(3)
        ->and($byName['shared-account']['attempts'])->toBe(2)
        ->and($byName['shared-account']['successes'])->toBe(1)
        ->and($byName['shared-account']['user_uuid'])->toBe($shared->uuid)
        ->and($byName['other-account']['successes'])->toBe(1)
        ->and($byName['guessed-name']['user_uuid'])->toBeNull()
        // Nothing from another address leaked in, and no secret rode along with the groups.
        ->and(json_encode($response->json(), JSON_THROW_ON_ERROR))->not->toContain('198.51.100.30');
});

it('stops naming accounts at its cap and says that it did', function (): void {
    historyAdmin();
    LoginEvent::factory()
        ->count(51)
        ->sequence(fn (Sequence $sequence): array => ['username_attempted' => 'name-'.$sequence->index])
        ->from('203.0.113.31')
        ->create();

    $response = test()->getJson('/api/admin/login-events/associated-accounts?ip=203.0.113.31');
    $response->assertOk()->assertJsonPath('data.truncated', true)->assertJsonCount(50, 'data.accounts');
});

it('refuses an address lookup it cannot read', function (): void {
    historyAdmin();

    $response = test()->getJson('/api/admin/login-events/associated-accounts?ip=203.0.113.0%2F24');
    $response->assertStatus(422);

    /** @var array<string, mixed>|null $error */
    $error = collect($response->json('errors') ?? [])->first();
    expect($error['meta']['source_field'] ?? null)->toBe('ip');
});

it('refuses an address lookup from a caller who is not root', function (): void {
    LoginEvent::factory()->from('203.0.113.32')->create();

    Sanctum::actingAs(User::factory()->create(['root_admin' => false]));
    test()->getJson('/api/admin/login-events/associated-accounts?ip=203.0.113.32')->assertForbidden();
});
