<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Captcha\CaptchaVerifier;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Symfony\Component\HttpKernel\Exception\HttpException;

uses(RefreshDatabase::class);

/** Rebuild the captcha singletons so config and stored settings changes take effect. */
function freshVerifier(): CaptchaVerifier
{
    foreach ([RuleRepository::class, Pterodactyl\Captcha\Rules\RuleMatcher::class, Pterodactyl\Captcha\Providers\ProviderRegistry::class, CaptchaVerifier::class] as $bound) {
        app()->forgetInstance($bound);
    }

    return app(CaptchaVerifier::class);
}

function loginRequest(array $body = [], string $host = 'localhost'): Request
{
    return Request::create("http://{$host}/auth/login", 'POST', $body);
}

function storeRules(array $rules): void
{
    app(RuleRepository::class)->save($rules);
}

it('does nothing at all while the master switch is off', function (): void {
    config(['captcha.enabled' => false]);

    freshVerifier()->check(loginRequest(), 'auth.login');

    expect(true)->toBeTrue();
});

it('rejects a required action submitted without a captcha response', function (): void {
    Http::fake();

    expect(fn () => freshVerifier()->check(loginRequest(), 'auth.login'))->toThrow(HttpException::class);

    Http::assertNothingSent();
});

it('rejects when a check names an action the panel has no rule for', function (): void {
    config(['captcha.enabled' => false]);
    freshVerifier()->check(loginRequest(), 'auth.login');

    config(['captcha.enabled' => true]);

    expect(fn () => freshVerifier()->check(loginRequest(), 'auth.typoed-rule'))->toThrow(HttpException::class);
});

it('lets a request no rule claims pass when nobody named an action', function (): void {
    $unclaimed = Request::create('http://localhost/api/client/servers/1', 'GET');

    freshVerifier()->check($unclaimed);

    expect(true)->toBeTrue();
});

it('rejects a token the provider refuses', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => false, 'error-codes' => ['invalid-input-response']]),
    ]);

    expect(fn () => freshVerifier()->check(loginRequest(['g-recaptcha-response' => 'nope']), 'auth.login'))->toThrow(HttpException::class);
});

it('accepts a token the provider confirms from this host', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => true, 'hostname' => 'localhost']),
    ]);

    freshVerifier()->check(loginRequest(['g-recaptcha-response' => 'solved-'.uniqid()]), 'auth.login');

    expect(true)->toBeTrue();
});

it('rejects a token solved for another host', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => true, 'hostname' => 'phishing-site.test']),
    ]);

    expect(fn () => freshVerifier()->check(loginRequest(['g-recaptcha-response' => 'elsewhere']), 'auth.login'))->toThrow(HttpException::class);
});

it('rejects the second use of one token, whichever answer the provider gave', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => true, 'hostname' => 'localhost']),
    ]);

    $verifier = freshVerifier();
    $token = 'single-use-'.uniqid();

    $verifier->check(loginRequest(['g-recaptcha-response' => $token]), 'auth.login');

    $second = loginRequest(['g-recaptcha-response' => $token]);
    expect(fn () => $verifier->check($second, 'auth.login'))->toThrow(HttpException::class);

    Http::assertSentCount(1);
});

it('checks one request once, even when two callers ask', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => true, 'hostname' => 'localhost']),
    ]);

    $verifier = freshVerifier();
    $request = loginRequest(['g-recaptcha-response' => 'shared-'.uniqid()]);

    $verifier->check($request, 'auth.login');
    $verifier->check($request, 'auth.login');

    Http::assertSentCount(1);
});

it('refuses a token submitted under another provider field', function (): void {
    Http::fake();

    expect(fn () => freshVerifier()->check(loginRequest(['h-captcha-response' => 'not-recaptcha']), 'auth.login'))->toThrow(HttpException::class);

    Http::assertNothingSent();
});

it('lets an action pass while every provider is switched off, an administrators choice', function (): void {
    config([
        'captcha.providers.recaptcha.enabled' => false,
        'captcha.providers.hcaptcha.enabled' => false,
        'captcha.providers.turnstile.enabled' => false,
    ]);

    freshVerifier()->check(loginRequest(), 'auth.login');

    expect(true)->toBeTrue();
});

it('rejects a required action whose provider is on but broken', function (): void {
    config([
        'captcha.providers.recaptcha.enabled' => true,
        'captcha.providers.recaptcha.secret_key' => '',
        'captcha.providers.hcaptcha.enabled' => false,
        'captcha.providers.turnstile.enabled' => false,
    ]);

    Http::fake();

    expect(fn () => freshVerifier()->check(loginRequest(), 'auth.login'))->toThrow(HttpException::class);

    Http::assertNothingSent();
});

it('lets a token-less request through when the rule does not require one', function (): void {
    storeRules([
        'probe.optional' => ['path' => 'probe/optional', 'methods' => ['POST'], 'required' => false],
    ]);

    freshVerifier()->check(Request::create('http://localhost/probe/optional', 'POST'));

    expect(true)->toBeTrue();
});

it('binds a token to the action its rule asked for', function (): void {
    config([
        'captcha.providers.turnstile.enabled' => true,
        'captcha.providers.turnstile.site_key' => 'ts-site',
        'captcha.providers.turnstile.secret_key' => 'ts-secret',
    ]);

    storeRules([
        'probe.action' => [
            'path' => 'probe/action',
            'methods' => ['POST'],
            'provider' => 'turnstile',
            'required' => true,
            'action' => 'checkout',
            'require_action' => true,
            'hostname_check' => false,
        ],
    ]);

    $verifier = freshVerifier();
    $url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    Http::fake([
        $url => Http::sequence()
            ->push(['success' => true])
            ->push(['success' => true, 'action' => 'something-else'])
            ->push(['success' => true, 'action' => 'checkout']),
    ]);

    expect(fn () => $verifier->check(Request::create('http://localhost/probe/action', 'POST', ['cf-turnstile-response' => 'a1'.uniqid()]), 'probe.action'))->toThrow(HttpException::class);
    expect(fn () => $verifier->check(Request::create('http://localhost/probe/action', 'POST', ['cf-turnstile-response' => 'a2'.uniqid()]), 'probe.action'))->toThrow(HttpException::class);

    $verifier->check(Request::create('http://localhost/probe/action', 'POST', ['cf-turnstile-response' => 'a3'.uniqid()]), 'probe.action');

    expect(true)->toBeTrue();
});

it('rejects a token the provider says has expired', function (): void {
    config([
        'captcha.providers.hcaptcha.enabled' => true,
        'captcha.providers.hcaptcha.site_key' => 'hc-site',
        'captcha.providers.hcaptcha.secret_key' => 'hc-secret',
    ]);

    storeRules([
        'probe.expired' => [
            'path' => 'probe/expired',
            'methods' => ['POST'],
            'provider' => 'hcaptcha',
            'required' => true,
            'hostname_check' => false,
        ],
    ]);

    Http::fake([
        'https://api.hcaptcha.com/siteverify' => Http::response([
            'success' => true,
            'expires_at' => time() - 10,
        ]),
    ]);

    expect(fn () => freshVerifier()->check(
        Request::create('http://localhost/probe/expired', 'POST', ['h-captcha-response' => 'stale-'.uniqid()]),
        'probe.expired'
    ))->toThrow(HttpException::class);
});

it('never puts tokens or secrets into the rejection a browser sees', function (): void {
    Http::fake([
        'https://www.google.com/recaptcha/api/siteverify' => Http::response(['success' => false, 'error-codes' => ['invalid-input-secret']]),
    ]);

    $secret = (string) config('captcha.providers.recaptcha.secret_key');
    $token = 'leak-probe-'.uniqid();

    try {
        freshVerifier()->check(loginRequest(['g-recaptcha-response' => $token]), 'auth.login');
        $this->fail('the request should have been rejected');
    } catch (HttpException $exception) {
        expect($exception->getMessage())->not->toContain($token)
            ->and($exception->getMessage())->not->toContain($secret)
            ->and($exception->getMessage())->toBe('Failed to validate the captcha response.');
    }
});
