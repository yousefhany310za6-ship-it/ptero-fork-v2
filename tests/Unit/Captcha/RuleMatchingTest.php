<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Pterodactyl\Captcha\Rules\CaptchaRule;

it('matches a rule wired to a path and method', function (): void {
    $rule = CaptchaRule::fromArray(['path' => 'auth/login', 'methods' => ['POST']], 'test.login');

    expect($rule->matches(Request::create('/auth/login', 'POST')))->toBeTrue();
});

it('refuses a request using another method', function (): void {
    $rule = CaptchaRule::fromArray(['path' => 'auth/login', 'methods' => ['POST']], 'test.login');

    expect($rule->matches(Request::create('/auth/login', 'GET')))->toBeFalse();
});

it('ignores leading and trailing slashes on the path', function (): void {
    $rule = CaptchaRule::fromArray(['path' => '/auth/login/', 'methods' => ['POST']], 'test.login');

    expect($rule->matches(Request::create('/auth/login', 'POST')))->toBeTrue();
});

it('matches wildcard paths', function (): void {
    $rule = CaptchaRule::fromArray(['path' => 'api/client/servers/*/backups', 'methods' => ['POST']], 'test.backups');

    expect($rule->matches(Request::create('/api/client/servers/12/backups', 'POST')))->toBeTrue();
    expect($rule->matches(Request::create('/api/client/servers/12/files', 'POST')))->toBeFalse();
});

it('matches by route name when the rule names one', function (): void {
    $rule = CaptchaRule::fromArray(['route' => 'auth.login', 'methods' => ['POST']], 'test.named');

    $request = Request::create('/auth/login', 'POST');
    $request->setRouteResolver(fn () => (new Illuminate\Routing\Route(['POST'], '/auth/login', fn () => null))->name('auth.login'));

    expect($rule->matches($request))->toBeTrue();
});

it('refuses a route that does not carry the named route', function (): void {
    $rule = CaptchaRule::fromArray(['route' => 'auth.login', 'methods' => ['POST']], 'test.named');

    $request = Request::create('/auth/login', 'POST');
    $request->setRouteResolver(fn () => (new Illuminate\Routing\Route(['POST'], '/auth/login', fn () => null))->name('auth.other'));

    expect($rule->matches($request))->toBeFalse();
});

it('is not wired when it names no endpoint', function (): void {
    expect(CaptchaRule::fromArray(['methods' => ['POST']], 'test.ghost')->isWired())->toBeFalse();
});

it('is wired by path or by route alone', function (): void {
    expect(CaptchaRule::fromArray(['path' => 'auth/login'], 'test.a')->isWired())->toBeTrue();
    expect(CaptchaRule::fromArray(['route' => 'auth.login'], 'test.b')->isWired())->toBeTrue();
});

it('defaults to POST only when methods are missing or empty', function (): void {
    expect(CaptchaRule::fromArray(['path' => 'a'], 'test.c')->methods)->toBe(['POST']);
    expect(CaptchaRule::fromArray(['path' => 'a', 'methods' => []], 'test.d')->methods)->toBe(['POST']);
});

it('survives a round trip through the settings shape', function (): void {
    $rule = CaptchaRule::fromArray([
        'path' => 'auth/login',
        'methods' => ['post', 'POST', 'PUT'],
        'provider' => 'turnstile',
        'required' => false,
        'action' => 'login',
        'require_action' => true,
        'hostname_check' => false,
    ], 'test.round');

    $again = CaptchaRule::fromArray($rule->toArray(), 'ignored');

    expect($again->toArray())->toBe($rule->toArray());
});
