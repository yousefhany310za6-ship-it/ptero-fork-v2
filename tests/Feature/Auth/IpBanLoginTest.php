<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Security\IpBanService;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    User::factory()->create(['username' => 'someone', 'email' => 'someone@example.com']);
});

/**
 * A sign-in attempt from an address, in whatever notation a client's socket happens to
 * present it. The captcha and throttle stages sit behind the ban check, so nothing else is
 * needed to reach it.
 */
function attemptSignIn(string $remoteAddress, array $serverHeaders = []): Illuminate\Testing\TestResponse
{
    return test()->withServerVariables([
        'REMOTE_ADDR' => $remoteAddress,
        ...$serverHeaders,
    ])->postJson('/auth/login', ['user' => 'someone', 'password' => 'wrong-password']);
}

function expectRefused(Illuminate\Testing\TestResponse $response): void
{
    $response->assertForbidden();
    expect($response->json('errors.0.code'))->toBe('IpRestricted');

    // Nothing about the client was remembered: the refusal came before the session began,
    // which is what stops a banned address from accumulating state to hammer with.
    $response->assertCookieMissing((string) Config::get('session.cookie'));
    test()->assertGuest();
}

function expectNotRefusedByBan(Illuminate\Testing\TestResponse $response): void
{
    expect($response->json('errors.0.code'))->not->toBe('IpRestricted');
}

it('refuses a sign-in attempt from a banned address', function (string $spelling): void {
    IpBan::factory()->range('203.0.113.7')->create();

    expectRefused(attemptSignIn($spelling));
})->with([
    'the banned address' => ['203.0.113.7'],
    'written as ipv4 mapped' => ['::ffff:203.0.113.7'],
    'written as ipv4 mapped uppercase' => ['::FFFF:203.0.113.7'],
    'written in hexadecimal groups' => ['::ffff:cb00:7107'],
]);

it('refuses every host inside a banned range and none outside it', function (): void {
    IpBan::factory()->range('198.51.100.0/24')->create();

    expectRefused(attemptSignIn('198.51.100.1'));
    expectRefused(attemptSignIn('::ffff:198.51.100.200'));
    expectNotRefusedByBan(attemptSignIn('198.51.101.1'));
});

it('refuses an ipv6 address covered by a banned ipv6 range', function (): void {
    IpBan::factory()->range('2001:db8::/32')->create();

    expectRefused(attemptSignIn('2001:db8:dead:beef::1'));
    expectNotRefusedByBan(attemptSignIn('2001:db9::1'));
});

it('ignores a forwarded header that arrives over an untrusted socket', function (): void {
    IpBan::factory()->range('198.51.100.9')->create();

    // The socket is clean and the header claims a banned address. Trusting it would let any
    // client pick the address it is judged on.
    expectNotRefusedByBan(attemptSignIn('203.0.113.7', ['HTTP_X_FORWARDED_FOR' => '198.51.100.9']));

    // The socket is banned and the header claims a clean address; the socket is what counts.
    expectRefused(attemptSignIn('198.51.100.9', ['HTTP_X_FORWARDED_FOR' => '203.0.113.7']));
});

it('permits the address again once a temporary ban has run out', function (): void {
    IpBan::factory()->temporary(CarbonImmutable::now()->addMinute())->range('203.0.113.17')->create();

    expectRefused(attemptSignIn('203.0.113.17'));

    CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(3));

    try {
        expectNotRefusedByBan(attemptSignIn('203.0.113.17'));
    } finally {
        CarbonImmutable::setTestNow();
    }
});

it('permits the address as soon as the ban is lifted', function (): void {
    $ban = IpBan::factory()->range('203.0.113.18')->create();
    expectRefused(attemptSignIn('203.0.113.18'));

    $ban->delete();
    app(IpBanService::class)->flush();

    expectNotRefusedByBan(attemptSignIn('203.0.113.18'));
});

it('leaves other addresses and their accounts alone', function (): void {
    IpBan::factory()->range('203.0.113.19')->create();
    $user = User::factory()->create(['username' => 'untouched', 'email' => 'untouched@example.com']);

    $response = test()->withServerVariables(['REMOTE_ADDR' => '192.0.2.50'])
        ->postJson('/auth/login', ['user' => 'untouched', 'password' => 'nothing']);

    expectNotRefusedByBan($response);
    expect($user->fresh()->exists)->toBeTrue()
        ->and($user->fresh()->servers()->count())->toBe(0);
});

it('applies to every account that signs in from the address, not one of them', function (): void {
    IpBan::factory()->range('203.0.113.20')->create();
    User::factory()->count(3)->create();

    // The refusal names nobody, so it cannot be about an account at all.
    $response = attemptSignIn('203.0.113.20');
    expectRefused($response);
    expect($response->getContent())->not->toMatch('/someone|example\.com|user/i');
});

it('leaves key authenticated traffic alone until an operator asks otherwise', function (): void {
    IpBan::factory()->range('203.0.113.21')->create();
    $admin = User::factory()->create(['root_admin' => true]);

    $default = test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.21'])
        ->getJson('/api/admin/ip-bans');
    expect($default->json('errors.0.code'))->not->toBe('IpRestricted');

    Config::set('pterodactyl.security.ban_blocks_api_requests', true);

    $blocked = test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.21'])
        ->getJson('/api/client');
    expect($blocked->json('errors.0.code'))->toBe('IpRestricted');

    // The ban list itself stays reachable, otherwise the only way to undo a ban would be
    // to sign in from an address that is not allowed to sign in.
    $adminList = test()->withServerVariables(['REMOTE_ADDR' => '203.0.113.21'])->getJson('/api/admin/ip-bans');
    expect($adminList->json('errors.0.code'))->not->toBe('IpRestricted');
});

it('does not refuse an address merely because the ban table is empty', function (): void {
    expect(IpBan::query()->count())->toBe(0);
    expectNotRefusedByBan(attemptSignIn('203.0.113.7'));
});
