<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Pterodactyl\Contracts\Users\SuspendsAccounts;
use Pterodactyl\Contracts\Users\UnsuspendsAccounts;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Exceptions\Http\AccountSuspendedException;
use Pterodactyl\Models\ApiKey;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;

uses(RefreshDatabase::class);

/**
 * One attempt at the sign-in form from one address.
 */
function signInWithCredentials(string $remoteAddress, string $username, string $password): Illuminate\Testing\TestResponse
{
    return test()->withServerVariables([
        'REMOTE_ADDR' => $remoteAddress,
        'HTTP_USER_AGENT' => 'Mozilla/5.0 (automated test client)',
    ])->postJson('/auth/login', ['user' => $username, 'password' => $password]);
}

/**
 * Close an account the way an administrator does, so what the enforcement paths read is a
 * real suspension with a real reference behind it rather than a column set by hand.
 */
function closeAccount(User $target, ?CarbonImmutable $expiresAt = null): UserSuspension
{
    return app(SuspendsAccounts::class)->suspend(
        $target,
        User::factory()->admin()->create(),
        SuspensionReason::AbuseOfService,
        'Reports of abuse against this account were confirmed.',
        'Ticket #4412, escalated twice. Note nobody outside the panel should read.',
        $expiresAt,
    );
}

/**
 * @return array<int, LoginEvent>
 */
function eventsFor(int $userId): array
{
    return LoginEvent::query()->where('user_id', $userId)->orderBy('id')->get()->all();
}

/**
 * Drop what a request resolves from the container rather than from the wire.
 *
 * One test reuses one application across its requests, and the auth guard keeps the user it
 * resolved for the first of them; a real request boots a fresh application and reads the
 * session again. Without this, a suspension written between two requests in a test would be
 * invisible to the second one for a reason that cannot happen in production.
 */
function asAFreshRequest(): void
{
    test()->app('auth')->forgetGuards();
}

beforeEach(function (): void {
    // The suspension action queues the server stops, and nothing here is about the daemon.
    Queue::fake();

    // The captcha runs ahead of the controller on the web group, and these tests are about
    // what happens once an attempt has actually reached an account.
    config(['captcha.enabled' => false]);
});

it('refuses a suspended account at the sign-in form, naming the reference it is meant to quote', function (): void {
    $user = User::factory()->create(['username' => 'closed', 'email' => 'closed@example.com']);
    $suspension = closeAccount($user);

    signInWithCredentials('203.0.113.81', 'closed', 'password')
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException')
        ->assertJsonPath('errors.0.detail', 'This account is suspended. Quote support case '.$suspension->support_case_id.' when contacting support.');

    // Nothing was started: the refusal is the whole of what the attempt achieved.
    test()->assertGuest();

    $event = eventsFor($user->id)[0];
    expect($event->outcome)->toBe(LoginEventOutcome::Suspended)
        ->and($event->reason_code)->toBe('account_suspended')
        ->and($event->suspension_case_id)->toBe($suspension->support_case_id)
        ->and($event->ip_ban_id)->toBeNull()
        ->and($event->username_attempted)->toBe('closed');
});

it('gives the account holder what they need in order to ask about it', function (): void {
    config([
        'pterodactyl.support.email' => 'help@example.com',
        'pterodactyl.support.discord_url' => 'https://discord.gg/example',
    ]);

    $user = User::factory()->create(['username' => 'informed', 'email' => 'informed@example.com']);
    $suspension = closeAccount($user, CarbonImmutable::parse('2026-11-20 12:00:00'));

    $meta = signInWithCredentials('203.0.113.90', 'informed', 'password')
        ->assertStatus(403)
        ->json('errors.0.meta');

    expect($meta['support_case_id'])->toBe($suspension->support_case_id)
        ->and($meta['message'])->toBe('Reports of abuse against this account were confirmed.')
        ->and($meta['is_permanent'])->toBeFalse()
        // Read back the way the request read it, so the string is compared against the same
        // load rather than against the value that was passed in with its microseconds intact.
        ->and($meta['expires_at'])->toBe($suspension->refresh()->expires_at?->toIso8601String())
        ->and($meta['support'])->toBe([
            'email' => 'help@example.com',
            'discord_url' => 'https://discord.gg/example',
        ]);
});

it('names no contact the panel was never given', function (): void {
    config([
        'pterodactyl.support.email' => '',
        'pterodactyl.support.discord_url' => '',
    ]);

    $user = User::factory()->create(['username' => 'uncontactable', 'email' => 'uncontactable@example.com']);
    closeAccount($user);

    $meta = signInWithCredentials('203.0.113.91', 'uncontactable', 'password')->assertStatus(403)->json('errors.0.meta');

    expect($meta['support'])->toBe([])
        ->and($meta['is_permanent'])->toBeTrue()
        ->and($meta['expires_at'])->toBeNull();
});

it('keeps the reasoning to itself when it refuses', function (): void {
    $user = User::factory()->create(['username' => 'quiet', 'email' => 'quiet@example.com']);
    closeAccount($user);

    $body = json_encode(signInWithCredentials('203.0.113.82', 'quiet', 'password')->json(), JSON_THROW_ON_ERROR);

    // The reference is theirs to quote. Why the panel decided, who decided, and what was
    // written down about them are not.
    expect($body)->not->toContain('Ticket #4412')
        ->and($body)->not->toContain('abuse_of_service')
        ->and($body)->not->toContain('created_by');
});

it('tells a wrong password nothing about the state of the account', function (): void {
    $user = User::factory()->create(['username' => 'hidden', 'email' => 'hidden@example.com']);
    closeAccount($user);

    signInWithCredentials('203.0.113.83', 'hidden', 'not-the-password')
        ->assertBadRequest()
        ->assertJsonPath('errors.0.code', 'DisplayException')
        ->assertJsonPath('errors.0.detail', 'No account matching those credentials could be found.');

    $event = eventsFor($user->id)[0];
    expect($event->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($event->reason_code)->toBe('credentials_invalid')
        ->and($event->suspension_case_id)->toBeNull();
});

it('lets an account whose suspension was lifted sign in again', function (): void {
    $user = User::factory()->create(['username' => 'restored', 'email' => 'restored@example.com']);
    $suspension = closeAccount($user);

    app(UnsuspendsAccounts::class)->unsuspend($suspension->refresh());

    signInWithCredentials('203.0.113.84', 'restored', 'password')->assertOk();

    test()->assertAuthenticatedAs($user);
});

it('refuses a two-factor checkpoint whose account was closed while it waited, without spending the code', function (): void {
    $secret = 'JBSWY3DPEHPK3PXP';
    $user = User::factory()->create([
        'username' => 'twofactor',
        'email' => 'twofactor@example.com',
        'use_totp' => true,
        'totp_secret' => Crypt::encrypt($secret),
    ]);

    $checkpoint = signInWithCredentials('203.0.113.85', 'twofactor', 'password')->assertOk();
    expect($checkpoint->json('data.complete'))->toBeFalse();

    // The account is closed between the password and the second factor.
    closeAccount($user);

    test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.85'])
        ->postJson('/auth/login/checkpoint', [
            'confirmation_token' => $checkpoint->json('data.confirmation_token'),
            'authentication_code' => (new Google2FA())->getCurrentOtp($secret),
        ])
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException');

    test()->assertGuest();

    // The password attempt, the checkpoint it opened, and the refusal: the last row is the
    // suspension, not a second-factor failure that never happened.
    [$pending, $refused] = eventsFor($user->id);
    expect($pending->outcome)->toBe(LoginEventOutcome::Checkpoint)
        ->and($refused->outcome)->toBe(LoginEventOutcome::Suspended);
});

it('refuses a closed account on the API with the session it still has', function (): void {
    $user = User::factory()->create(['username' => 'resident', 'email' => 'resident@example.com']);
    signInWithCredentials('203.0.113.86', 'resident', 'password')->assertOk();
    test()->assertAuthenticatedAs($user);

    closeAccount($user);
    asAFreshRequest();

    // The panel has not dissolved this browser's session yet — with the array session driver a
    // test request never carries the cookie back, so Sanctum reads the session straight out of
    // the container. What the API path promises is the refusal; that the session itself goes is
    // the browser route below, where the request really does own one.
    test()->getJson('/api/client/announcements')
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException')
        ->assertJsonPath('errors.0.detail', AccountSuspendedException::DEFAULT_MESSAGE);
});

it('closes the browser session of an account that was suspended elsewhere', function (): void {
    $user = User::factory()->create(['username' => 'idle', 'email' => 'idle@example.com']);
    signInWithCredentials('203.0.113.87', 'idle', 'password')->assertOk();

    $key = test()->app('auth')->guard('web')->getName();
    expect(session($key))->toBe($user->id);

    closeAccount($user);
    asAFreshRequest();

    // A page load, not a data request: the answer is to send them somewhere rather than to
    // hand them a payload, and the session is destroyed either way.
    test()->get('/locales/locale.json?locale=en&namespace=validation')->assertRedirect('/auth/login');
    test()->assertGuest();
    expect(session($key))->toBeNull();
});

it('refuses an account API key whose owner was suspended', function (): void {
    $user = User::factory()->create(['username' => 'scripted', 'email' => 'scripted@example.com']);

    $secret = Str::random(ApiKey::KEY_LENGTH);
    $key = ApiKey::factory()->create([
        'user_id' => $user->id,
        'key_type' => ApiKey::TYPE_ACCOUNT,
        'token' => encrypt($secret),
    ]);

    closeAccount($user);

    test()->withToken($key->identifier.$secret)
        ->getJson('/api/client/announcements')
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException')
        ->assertJsonPath('errors.0.detail', AccountSuspendedException::DEFAULT_MESSAGE);
});

it('refuses a suspended administrator the admin API', function (): void {
    $admin = User::factory()->admin()->create();
    closeAccount($admin);

    Sanctum::actingAs($admin);

    test()->getJson('/api/admin/users')
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException');
});

it('refuses a closed account before it is asked to enable two-factor authentication', function (): void {
    config(['pterodactyl.auth.2fa_required' => 2]);

    $user = User::factory()->create();
    closeAccount($user);
    Sanctum::actingAs($user);

    test()->getJson('/api/client/announcements')
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException');
});

it('still asks a live account without two-factor authentication to enable it', function (): void {
    config(['pterodactyl.auth.2fa_required' => 2]);

    Sanctum::actingAs(User::factory()->create());

    test()->getJson('/api/client/announcements')
        ->assertBadRequest()
        ->assertJsonPath('errors.0.code', 'TwoFactorAuthRequiredException');
});

it('counts attempts against one account without locking out the others signing in from the same address', function (): void {
    User::factory()->create(['username' => 'alpha', 'email' => 'alpha@example.com']);
    User::factory()->create(['username' => 'beta', 'email' => 'beta@example.com']);

    foreach (range(1, 3) as $attempt) {
        signInWithCredentials('203.0.113.88', 'alpha', 'wrong'.$attempt)->assertBadRequest();
    }

    signInWithCredentials('203.0.113.88', 'alpha', 'wrong4')->assertStatus(429);

    // The lockout belongs to the account that was hammered, not to the address everyone at
    // that office signs in from.
    signInWithCredentials('203.0.113.88', 'beta', 'wrong')->assertBadRequest();
});
