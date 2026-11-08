<?php

declare(strict_types=1);

use Pterodactyl\Support\Network\IpAddressNormalizer;

it('reads an IPv4 address as its IPv4-mapped equivalent', function (): void {
    $plain = IpAddressNormalizer::parse('1.2.3.4');
    $mapped = IpAddressNormalizer::parse('::ffff:1.2.3.4');
    $upper = IpAddressNormalizer::parse('::FFFF:1.2.3.4');
    $hexGrouped = IpAddressNormalizer::parse('::ffff:0102:0304');

    expect($plain)->not->toBeNull()
        ->and($plain->isIpv4())->toBeTrue()
        ->and($plain->bytes)->toBe($mapped->bytes)
        ->and($mapped->bytes)->toBe($upper->bytes)
        ->and($upper->bytes)->toBe($hexGrouped->bytes);
});

it('prints a mapped address back as a dotted quad', function (): void {
    expect(IpAddressNormalizer::parse('::ffff:203.0.113.7')->label())->toBe('203.0.113.7')
        ->and(IpAddressNormalizer::parse('203.0.113.7')->label())->toBe('203.0.113.7')
        ->and(IpAddressNormalizer::parse('2001:db8::1')->label())->toBe('2001:db8::1')
        ->and(IpAddressNormalizer::parse('2001:0DB8:0000:0000:0000:0000:0000:0001')->isIpv4())->toBeFalse();
});

it('collapses every spelling of the loopback address onto one value', function (): void {
    expect(IpAddressNormalizer::parse('::1')->bytes)
        ->toBe(IpAddressNormalizer::parse('0:0:0:0:0:0:0:1')->bytes);
});

it('refuses spellings that do not denote one address', function (string $value): void {
    expect(IpAddressNormalizer::parse($value))->toBeNull();
})->with([
    'leading zero octet' => ['1.2.3.04'],
    'octal-read first octet' => ['010.0.0.1'],
    'IPv6 zone identifier' => ['fe80::1%eth0'],
    'out of range octet' => ['999.1.1.1'],
    'hostname' => ['example.com'],
    'empty string' => [''],
    'a range' => ['1.2.3.4/24'],
    'mapped address with a leading zero' => ['::ffff:1.2.3.04'],
]);

it('matches a client against a range written in IPv4 notation', function (): void {
    $network = IpAddressNormalizer::network('192.0.2.0/24');

    expect($network)->not->toBeNull()
        ->and($network->contains(IpAddressNormalizer::parse('192.0.2.7')))->toBeTrue()
        // The same host arriving in the notation a dual-stack socket reports it in.
        ->and($network->contains(IpAddressNormalizer::parse('::ffff:192.0.2.7')))->toBeTrue()
        ->and($network->contains(IpAddressNormalizer::parse('192.0.3.7')))->toBeFalse();
});

it('normalises a range written in mapped notation onto the IPv4 bounds', function (): void {
    expect(IpAddressNormalizer::network('::ffff:192.0.2.0/24')->first)
        ->toBe(IpAddressNormalizer::network('192.0.2.0/24')->first)
        ->and(IpAddressNormalizer::network('::ffff:192.0.2.0/24')->last)
        ->toBe(IpAddressNormalizer::network('192.0.2.0/24')->last);
});

it('reads a prefix on a mapped address as an IPv4 prefix instead of an IPv6 one', function (): void {
    // Read as an IPv6 prefix, ::ffff:192.0.2.7/32 would cover a whole slice of IPv4 space
    // and one host ban would silence thousands of unrelated addresses.
    $host = IpAddressNormalizer::network('::ffff:192.0.2.7/32');

    expect($host->isSingleAddress())->toBeTrue()
        ->and($host->contains(IpAddressNormalizer::parse('192.0.2.7')))->toBeTrue()
        ->and($host->contains(IpAddressNormalizer::parse('192.0.2.8')))->toBeFalse();
});

it('keeps an IPv6 range out of the IPv4 space', function (): void {
    $network = IpAddressNormalizer::network('2001:db8::/32');

    expect($network->contains(IpAddressNormalizer::parse('2001:db8::dead:beef')))->toBeTrue()
        ->and($network->contains(IpAddressNormalizer::parse('192.0.2.7')))->toBeFalse();
});

it('builds a whole-space range only from a zero prefix', function (): void {
    $all = IpAddressNormalizer::network('::/0');

    // A /0 is the only range that spans both families, mapped addresses included.
    expect($all->contains(IpAddressNormalizer::parse('192.0.2.7')))->toBeTrue()
        ->and($all->contains(IpAddressNormalizer::parse('2001:db8::1')))->toBeTrue();
});

it('reads a bare address as a single-host range', function (): void {
    $network = IpAddressNormalizer::network('192.0.2.7');

    expect($network->isSingleAddress())->toBeTrue()
        ->and($network->label())->toBe('192.0.2.7/32')
        ->and($network->contains(IpAddressNormalizer::parse('192.0.2.7')))->toBeTrue();
});

it('refuses a prefix that cannot exist for the address it is written against', function (string $value): void {
    expect(IpAddressNormalizer::network($value))->toBeNull();
})->with([
    'over-long IPv4 prefix' => ['192.0.2.0/33'],
    'over-long IPv6 prefix' => ['2001:db8::/129'],
    'non-numeric prefix' => ['192.0.2.0/abc'],
    'missing prefix' => ['192.0.2.0/'],
    'negative prefix' => ['192.0.2.0/-1'],
    'double prefix' => ['192.0.2.0/24/24'],
]);

it('reads stored bytes back with their family', function (): void {
    $v4 = IpAddressNormalizer::parse('192.0.2.7');
    $v6 = IpAddressNormalizer::parse('2001:db8::1');

    expect(IpAddressNormalizer::fromStorage($v4->bytes)->isIpv4())->toBeTrue()
        ->and(IpAddressNormalizer::fromStorage($v6->bytes)->isIpv4())->toBeFalse()
        ->and(IpAddressNormalizer::fromStorage($v4->bytes)->bytes)->toBe($v4->bytes)
        ->and(IpAddressNormalizer::fromStorage('short'))->toBeNull()
        ->and(IpAddressNormalizer::fromStorage(null))->toBeNull();
});
