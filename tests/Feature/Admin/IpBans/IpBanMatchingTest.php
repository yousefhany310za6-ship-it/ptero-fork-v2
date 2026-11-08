<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Security\IpBanService;
use Pterodactyl\Support\Network\IpAddressNormalizer;

uses(RefreshDatabase::class);

function rootUser(): User
{
    return User::factory()->create(['root_admin' => true]);
}

function banService(): IpBanService
{
    return app(IpBanService::class);
}

/** The active ban covering an address written the way a client would write it. */
function bannedBy(string $value): ?int
{
    $address = IpAddressNormalizer::parse($value);
    expect($address)->not->toBeNull("[$value] should parse as an address.");

    return banService()->match($address);
}

it('matches every notation of the address that was banned', function (string $spelling): void {
    $ban = banService()->ban('203.0.113.7', 'Automated test ban.', null, rootUser());

    expect(bannedBy($spelling))->toBe($ban->id);
})->with([
    'the address itself' => ['203.0.113.7'],
    'ipv4 mapped' => ['::ffff:203.0.113.7'],
    'ipv4 mapped, uppercase' => ['::FFFF:203.0.113.7'],
    'ipv4 mapped, hexadecimal' => ['::ffff:cb00:7107'],
]);

it('matches a whole range without matching the next one', function (): void {
    $ban = banService()->ban('198.51.100.0/24', 'Automated test ban.', null, rootUser());

    expect(bannedBy('198.51.100.1'))->toBe($ban->id)
        ->and(bannedBy('::ffff:198.51.100.200'))->toBe($ban->id)
        ->and(bannedBy('198.51.100.255'))->toBe($ban->id)
        ->and(bannedBy('198.51.99.255'))->toBeNull()
        ->and(bannedBy('198.51.101.1'))->toBeNull();
});

it('keeps an ipv6 range inside the ipv6 space', function (): void {
    // Wide enough to need confirming, which is a separate rule from staying in its family.
    $ban = banService()->ban('2001:db8::/32', 'Automated test ban.', null, rootUser(), true);

    expect(bannedBy('2001:db8::1234'))->toBe($ban->id)
        ->and(bannedBy('2001:db9::1'))->toBeNull()
        ->and(bannedBy('203.0.113.7'))->toBeNull();
});

it('stops matching the moment a temporary ban expires', function (): void {
    $ban = banService()->ban('203.0.113.9', 'Automated test ban.', CarbonImmutable::now()->addMinute(), rootUser());
    expect(bannedBy('203.0.113.9'))->toBe($ban->id);

    // The expiry is read from the cached row, so the ban lifts at the second it falls over
    // rather than whenever the cache next happens to be rebuilt.
    CarbonImmutable::setTestNow(CarbonImmutable::now()->addMinutes(2));

    try {
        expect(bannedBy('203.0.113.9'))->toBeNull()
            ->and(IpBan::query()->count())->toBe(1);
    } finally {
        CarbonImmutable::setTestNow();
    }
});

it('answers from the cache, so a flood of attempts is not a flood of queries', function (): void {
    banService()->ban('203.0.113.0/24', 'Automated test ban.', null, rootUser());

    // The first read fills the cache; everything after it is served from there.
    expect(bannedBy('203.0.113.5'))->not->toBeNull();

    DB::flushQueryLog();
    DB::enableQueryLog();

    foreach (range(0, 49) as $octet) {
        bannedBy('203.0.113.'.$octet);
    }

    expect(DB::getQueryLog())->toBeArray()->toHaveCount(0);

    DB::disableQueryLog();
});

it('lifts a ban immediately rather than at the end of the cache life', function (): void {
    $ban = banService()->ban('203.0.113.42', 'Automated test ban.', null, rootUser());
    expect(bannedBy('203.0.113.42'))->toBe($ban->id);

    banService()->lift($ban);

    expect(bannedBy('203.0.113.42'))->toBeNull()
        ->and(IpBan::query()->count())->toBe(0);
});

it('refuses to ban loopback, which the panel itself answers from', function (string $value): void {
    expect(fn () => banService()->ban($value, 'Automated test ban.', null, rootUser()))
        ->toThrow(ValidationException::class);
})->with([
    'the v4 address' => ['127.0.0.1'],
    'the v4 range' => ['127.0.0.0/8'],
    'the v6 address' => ['::1'],
    'mapped form' => ['::ffff:127.0.0.1'],
]);

it('requires an acknowledgement before banning more than 65536 hosts', function (string $value, bool $acknowledge, bool $banned): void {
    $service = banService();

    if (! $banned) {
        expect(fn () => $service->ban($value, 'Automated test ban.', null, rootUser(), $acknowledge))
            ->toThrow(ValidationException::class);

        return;
    }

    $ban = $service->ban($value, 'Automated test ban.', null, rootUser(), $acknowledge);
    expect($ban->exists)->toBeTrue();
})->with([
    'a /24 needs nothing' => ['203.0.113.0/24', false, true],
    'a /8 is refused' => ['10.0.0.0/8', false, false],
    'a /8 acknowledged' => ['10.0.0.0/8', true, true],
    'an ipv6 /64 is refused' => ['2001:db8:abcd::/64', false, false],
    'an ipv6 /112 is fine' => ['2001:db8:abcd:0012::/112', false, true],
]);

it('converges duplicate ranges onto one row whichever notation they were written in', function (): void {
    banService()->ban('203.0.113.7', 'Automated test ban.', null, rootUser());

    expect(banService()->isBanned(IpAddressNormalizer::parse('203.0.113.7')))->toBeTrue();
    expect(IpBan::query()->count())->toBe(1);

    // Re-banning the same subject through its mapped spelling is the same range, so the
    // unique index reports it instead of stacking a second row to be lifted separately.
    expect(fn () => banService()->ban('::ffff:203.0.113.7', 'Automated test ban.', null, rootUser()))
        ->toThrow(ValidationException::class);
});

it('writes an address row without touching any account', function (): void {
    $root = User::factory()->create(['root_admin' => true]);
    User::factory()->count(3)->create();
    $before = User::query()->orderBy('id')->pluck('updated_at', 'id');

    banService()->ban('203.0.113.44', 'Automated test ban.', null, $root);

    // A ban is on a network address: no account, and no server of any account, is
    // changed by setting one. That is also what keeps a shared address from reaching
    // the people who happen to use it.
    expect(User::query()->orderBy('id')->pluck('updated_at', 'id'))->toEqual($before);
});
