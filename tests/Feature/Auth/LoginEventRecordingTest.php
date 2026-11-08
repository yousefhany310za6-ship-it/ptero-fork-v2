<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use PragmaRX\Google2FA\Google2FA;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Security\IpBanService;
use Pterodactyl\Support\Network\IpAddressNormalizer;

uses(RefreshDatabase::class);

/**
 * One attempt at the login endpoint, from an address and with whatever the client
 * described itself as. Every case here is about what the panel remembered afterwards.
 *
 * @param  array<string, string>  $serverVariables
 */
function signInAttempt(string $remoteAddress, string $username, string $password, array $serverVariables = []): Illuminate\Testing\TestResponse
{
    return test()->withServerVariables([
        'REMOTE_ADDR' => $remoteAddress,
        'HTTP_USER_AGENT' => 'Mozilla/5.0 (automated test client)',
        ...$serverVariables,
    ])->postJson('/auth/login', ['user' => $username, 'password' => $password]);
}

/**
 * @return array<int, LoginEvent>
 */
function historyFor(string $remoteAddress): array
{
    $address = IpAddressNormalizer::parse($remoteAddress);
    expect($address)->not->toBeNull();

    return LoginEvent::query()->forAddress($address)->orderBy('id')->get()->all();
}

beforeEach(function (): void {
    User::factory()->create(['username' => 'someone', 'email' => 'someone@example.com']);

    // The captcha is checked before the login controller runs, so an attempt that never
    // reached authentication has nothing to remember. Verification has its own suite; this
    // one is about what the panel records once an attempt is actually aimed at an account.
    config(['captcha.enabled' => false]);
});

it('records a successful sign-in against the account and the address it arrived from', function (): void {
    $user = User::factory()->create(['username' => 'history', 'email' => 'history@example.com']);

    signInAttempt('203.0.113.61', 'history', 'password')->assertOk();

    $event = historyFor('203.0.113.61')[0];
    expect($event->outcome)->toBe(LoginEventOutcome::Success)
        ->and($event->user_id)->toBe($user->id)
        ->and($event->user_uuid)->toBe($user->uuid)
        ->and($event->username_attempted)->toBe('history')
        ->and($event->address()?->label())->toBe('203.0.113.61')
        ->and($event->reason_code)->toBeNull()
        ->and($event->user_agent)->toBe('Mozilla/5.0 (automated test client)');
});

it('keeps the address the client came from in one byte form, whichever notation it arrived in', function (): void {
    signInAttempt('203.0.113.62', 'someone', 'wrong')->assertBadRequest();
    signInAttempt('::ffff:203.0.113.62', 'someone', 'wrong')->assertBadRequest();
    signInAttempt('::FFFF:cb00:713e', 'someone', 'wrong')->assertBadRequest();

    $rows = historyFor('203.0.113.62');
    expect($rows)->toHaveCount(3)
        ->and($rows[0]->ip_address)->toBe($rows[1]->ip_address)
        ->and($rows[1]->ip_address)->toBe($rows[2]->ip_address);
});

it('records a failed attempt against the account it was aimed at, separately from the success', function (): void {
    $user = User::factory()->create(['username' => 'target', 'email' => 'target@example.com']);

    signInAttempt('203.0.113.63', 'target', 'the-wrong-password')->assertBadRequest();
    signInAttempt('203.0.113.63', 'target', 'password')->assertOk();

    [$failure, $success] = historyFor('203.0.113.63');
    expect($failure->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($failure->reason_code)->toBe('credentials_invalid')
        ->and($failure->user_id)->toBe($user->id)
        ->and($success->outcome)->toBe(LoginEventOutcome::Success);
});

it('records an attempt at an account that does not exist without inventing one', function (): void {
    signInAttempt('203.0.113.64', 'never-created', 'password')->assertBadRequest();

    $event = historyFor('203.0.113.64')[0];
    expect($event->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($event->reason_code)->toBe('account_not_found')
        ->and($event->user_id)->toBeNull()
        ->and($event->user_uuid)->toBeNull()
        // The name is what makes an enumeration run visible, so it outlives the fact that
        // no account answers to it.
        ->and($event->username_attempted)->toBe('never-created');
});

it('records the two-factor checkpoint and then the sign-in that completes it', function (): void {
    $secret = 'JBSWY3DPEHPK3PXP';
    $user = User::factory()->create([
        'username' => 'twofactor',
        'email' => 'twofactor@example.com',
        'use_totp' => true,
        'totp_secret' => Crypt::encrypt($secret),
    ]);

    $checkpoint = signInAttempt('203.0.113.65', 'twofactor', 'password');
    $checkpoint->assertOk();
    expect($checkpoint->json('data.complete'))->toBeFalse();

    $token = (new Google2FA())->getCurrentOtp($secret);
    test()->withServerVariables([
        'REMOTE_ADDR' => '203.0.113.65',
        'HTTP_USER_AGENT' => 'Mozilla/5.0 (automated test client)',
    ])->postJson('/auth/login/checkpoint', [
        'confirmation_token' => $checkpoint->json('data.confirmation_token'),
        'authentication_code' => $token,
    ])->assertOk();

    [$pending, $signedIn] = historyFor('203.0.113.65');
    expect($pending->outcome)->toBe(LoginEventOutcome::Checkpoint)
        ->and($pending->user_id)->toBe($user->id)
        ->and($signedIn->outcome)->toBe(LoginEventOutcome::Success)
        ->and($signedIn->user_id)->toBe($user->id);
});

it('refuses a checkpoint that was never completed and records why', function (): void {
    User::factory()->create([
        'username' => 'twofactor',
        'email' => 'twofactor@example.com',
        'use_totp' => true,
        'totp_secret' => Crypt::encrypt('JBSWY3DPEHPK3PXP'),
    ]);

    signInAttempt('203.0.113.66', 'twofactor', 'password')->assertOk();

    test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.66'])
        ->postJson('/auth/login/checkpoint', [
            'confirmation_token' => 'not-the-token-that-was-issued',
            'authentication_code' => '123456',
        ])->assertBadRequest();

    [$pending, $refused] = historyFor('203.0.113.66');
    expect($pending->outcome)->toBe(LoginEventOutcome::Checkpoint)
        ->and($refused->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($refused->reason_code)->toBe('checkpoint_not_found')
        ->and($refused->user_id)->toBeNull()
        // The checkpoint endpoint names no account: the token it is given is the only
        // reference to one, and a token that matches nothing leaves the panel with no
        // account to record. The address is still the fact worth keeping here.
        ->and($refused->username_attempted)->toBeNull();
});

it('records a refused second factor against the account whose password was right', function (): void {
    $secret = 'JBSWY3DPEHPK3PXP';
    $user = User::factory()->create([
        'username' => 'twofactor',
        'email' => 'twofactor@example.com',
        'use_totp' => true,
        'totp_secret' => Crypt::encrypt($secret),
    ]);

    $checkpoint = signInAttempt('203.0.113.74', 'twofactor', 'password');

    test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.74'])
        ->postJson('/auth/login/checkpoint', [
            'confirmation_token' => $checkpoint->json('data.confirmation_token'),
            'authentication_code' => '000000',
        ])->assertBadRequest();

    [, $refused] = historyFor('203.0.113.74');
    // This is the row that matters most on the checkpoint path: someone held the password and
    // could not get past the account's own second factor.
    expect($refused->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($refused->reason_code)->toBe('second_factor_invalid')
        ->and($refused->user_id)->toBe($user->id)
        ->and($refused->user_uuid)->toBe($user->uuid);
});

it('records the lockout once per address while it lasts, not once per request', function (): void {
    // The default throttle allows three attempts; every later one is refused before the
    // credentials are even looked at.
    foreach (range(1, 4) as $attempt) {
        signInAttempt('203.0.113.67', 'someone', 'wrong'.$attempt);
    }

    [$first, $second, $third, $fourth] = historyFor('203.0.113.67');
    expect($first->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($second->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($third->outcome)->toBe(LoginEventOutcome::Failed)
        ->and($fourth->outcome)->toBe(LoginEventOutcome::Throttled);

    // A lockout costs the sender nothing to repeat, so it is the one outcome that is not
    // written again while the gate stands: the flood cannot turn into rows.
    signInAttempt('203.0.113.67', 'someone', 'wrong5')->assertStatus(429);
    signInAttempt('203.0.113.67', 'someone', 'wrong6')->assertStatus(429);

    $rows = historyFor('203.0.113.67');
    expect($rows)->toHaveCount(4)
        ->and($rows[3]->reason_code)->toBe('too_many_attempts')
        ->and($rows[3]->user_id)->toBeNull();
});

it('records which ban refused an address, and does not let a flood multiply the row', function (): void {
    $ban = IpBan::factory()->range('203.0.113.68')->create();

    signInAttempt('203.0.113.68', 'someone', 'password')->assertForbidden();
    signInAttempt('203.0.113.68', 'someone', 'password')->assertForbidden();
    signInAttempt('203.0.113.68', 'someone', 'password')->assertForbidden();

    $rows = historyFor('203.0.113.68');
    expect($rows)->toHaveCount(1)
        ->and($rows[0]->outcome)->toBe(LoginEventOutcome::Banned)
        ->and($rows[0]->ip_ban_id)->toBe($ban->id)
        ->and($rows[0]->user_id)->toBeNull();
});

it('records that an address was refused even when the ban that refused it has been lifted', function (): void {
    $ban = IpBan::factory()->range('203.0.113.69')->create();
    signInAttempt('203.0.113.69', 'someone', 'password')->assertForbidden();

    $ban->delete();
    app(IpBanService::class)->flush();

    $event = LoginEvent::query()->firstOrFail();
    // The row keeps naming a ban that no longer exists. That is the point: the history says
    // which rule applied at the time, and lifting a ban does not rewrite the past.
    expect($event->outcome)->toBe(LoginEventOutcome::Banned)
        ->and($event->ip_ban_id)->toBe($ban->id);
});

it('stores no password, no token, and no session id in the history', function (): void {
    signInAttempt('203.0.113.70', 'someone', 'a-password-nobody-may-see')->assertBadRequest();

    $event = LoginEvent::query()->firstOrFail();
    // The byte form of an address is binary, so the readable columns are what is checked:
    // anything a client could have leaked is in one of these.
    $readable = collect([
        $event->username_attempted,
        $event->user_agent,
        $event->reason_code,
        $event->user_uuid,
        $event->fingerprint,
        $event->outcome->value,
    ])->filter()->implode(' ');

    expect($readable)->not->toMatch('/a-password-nobody-may-see|password|token|secret|totp/i')
        // An address belongs to this table. The panel's general log files must not fill up
        // with who signed in from where, which is why a write failure is reported without
        // the QueryException that would quote the values it was given.
        ->and((string) @file_get_contents(base_path('storage/logs/laravel.log')))->not->toContain('203.0.113.70');
});

it('groups attempts from one client without storing what it said about itself', function (): void {
    signInAttempt('203.0.113.71', 'someone', 'wrong', ['HTTP_ACCEPT_LANGUAGE' => 'en-GB'])->assertBadRequest();
    signInAttempt('203.0.113.72', 'someone', 'wrong', ['HTTP_ACCEPT_LANGUAGE' => 'en-GB'])->assertBadRequest();
    signInAttempt('203.0.113.73', 'someone', 'wrong', ['HTTP_ACCEPT_LANGUAGE' => 'de-DE'])->assertBadRequest();

    [$first, $second, $third] = LoginEvent::query()->orderBy('id')->get()->all();

    expect($first->fingerprint)->toBe($second->fingerprint)
        ->and($first->fingerprint)->not->toBe($third->fingerprint)
        ->and($first->fingerprint)->toMatch('/^[0-9a-f]{64}$/')
        ->and($first->attributesToArray())->not->toHaveKey('accept_language');
});
