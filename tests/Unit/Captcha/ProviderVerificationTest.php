<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Http;
use Pterodactyl\Captcha\Providers\HCaptchaProvider;
use Pterodactyl\Captcha\Providers\RecaptchaProvider;
use Pterodactyl\Captcha\Providers\TurnstileProvider;
use Pterodactyl\Captcha\Value\ProviderSettings;

function providerSettings(string $name): ProviderSettings
{
    $config = config("captcha.providers.$name");

    return new ProviderSettings(
        name: $name,
        label: $config['label'],
        enabled: true,
        siteKey: 'site-key',
        secretKey: 'secret-key',
        verifyUrl: $config['verify_url'],
        scriptUrl: $config['script_url'],
        tokenField: $config['token_field'],
        hostnameCheck: true,
        allowedVerifyHosts: $config['allow']['verify_hosts'],
        allowedScriptHosts: $config['allow']['script_hosts'],
    );
}

function hcaptchaSettings(): ProviderSettings
{
    return providerSettings('hcaptcha');
}

function turnstileSettings(): ProviderSettings
{
    return providerSettings('turnstile');
}

function recaptchaSettings(): ProviderSettings
{
    return providerSettings('recaptcha');
}

it('reports a passed verification with the claims the provider made', function (): void {
    Http::fake([
        'https://challenges.cloudflare.com/*' => Http::response([
            'success' => true,
            'hostname' => 'panel.example',
            'action' => 'login',
        ]),
    ]);

    $result = (new TurnstileProvider(turnstileSettings()))->verify('token-1', '10.0.0.1');

    expect($result->passed)->toBeTrue()
        ->and($result->hostname)->toBe('panel.example')
        ->and($result->action)->toBe('login');

    Http::assertSent(fn ($request): bool => $request['secret'] === 'secret-key'
        && $request['response'] === 'token-1'
        && $request['remoteip'] === '10.0.0.1');
});

it('fails an empty token without asking the provider', function (): void {
    Http::fake();

    $result = (new TurnstileProvider(turnstileSettings()))->verify('', null);

    expect($result->passed)->toBeFalse()->and($result->reasons)->toContain('no token was submitted');
    Http::assertNothingSent();
});

it('fails a rejected token and carries the provider error codes', function (string $provider, string $url, string $reason): void {
    Http::fake([$url => Http::response(['success' => false, 'error-codes' => ['invalid-input-response']])]);

    $instance = match ($provider) {
        'recaptcha' => new RecaptchaProvider(recaptchaSettings()),
        'hcaptcha' => new HCaptchaProvider(hcaptchaSettings()),
        'turnstile' => new TurnstileProvider(turnstileSettings()),
    };

    $result = $instance->verify('bad-token', null);

    expect($result->passed)->toBeFalse()
        ->and($result->reasons)->toContain($reason)
        ->and($result->errorCodes)->toBe(['invalid-input-response']);
})->with([
    ['recaptcha', 'https://www.google.com/*', 'reCAPTCHA rejected the token'],
    ['hcaptcha', 'https://api.hcaptcha.com/*', 'hCaptcha rejected the token'],
    ['turnstile', 'https://challenges.cloudflare.com/*', 'Turnstile rejected the token'],
]);

it('treats an unreachable provider as a failed verification, never a pass', function (): void {
    Http::fake([
        'https://challenges.cloudflare.com/*' => Http::response(null, 500),
    ]);

    $result = (new TurnstileProvider(turnstileSettings()))->verify('token', null);

    expect($result->passed)->toBeFalse()->and($result->reasons)->toContain('the provider replied with HTTP 500');
});

it('treats a reply it cannot read as a failed verification', function (): void {
    Http::fake([
        'https://challenges.cloudflare.com/*' => Http::response('not json at all', 200, ['Content-Type' => 'text/plain']),
    ]);

    $result = (new TurnstileProvider(turnstileSettings()))->verify('token', null);

    expect($result->passed)->toBeFalse()->and($result->reasons)->toContain('the provider reply could not be read');
});

it('fails when the request to the provider itself throws', function (): void {
    Http::fake([
        'https://challenges.cloudflare.com/*' => fn (): Illuminate\Http\Client\Response => throw new RuntimeException('network down'),
    ]);

    $result = (new TurnstileProvider(turnstileSettings()))->verify('token', null);

    expect($result->passed)->toBeFalse()->and($result->reasons)->toContain('the provider could not be reached');
});

it('refuses to verify with a non-official endpoint configured', function (string $url): void {
    Http::fake();

    $settings = new ProviderSettings(
        name: 'turnstile',
        label: 'Cloudflare Turnstile',
        enabled: true,
        siteKey: 'site-key',
        secretKey: 'secret-key',
        verifyUrl: $url,
        scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
        tokenField: 'cf-turnstile-response',
        hostnameCheck: true,
        allowedVerifyHosts: ['challenges.cloudflare.com'],
        allowedScriptHosts: ['challenges.cloudflare.com'],
    );

    $provider = new TurnstileProvider($settings);

    expect($provider->configurationErrors())->toContain('The verification endpoint is not an official Cloudflare Turnstile host.')
        ->and($provider->verify('token', null)->passed)->toBeFalse();

    Http::assertNothingSent();
})->with([
    'internal address' => ['http://169.254.169.254/latest/meta-data'],
    'plain http' => ['http://challenges.cloudflare.com/turnstile/v0/siteverify'],
    'evil host' => ['https://challenges.cloudflare.com.evil.test/siteverify'],
]);

it('names missing keys as configuration errors', function (): void {
    $settings = new ProviderSettings(
        name: 'hcaptcha',
        label: 'hCaptcha',
        enabled: true,
        siteKey: '',
        secretKey: '',
        verifyUrl: 'https://api.hcaptcha.com/siteverify',
        scriptUrl: 'https://js.hcaptcha.com/1/api.js',
        tokenField: 'h-captcha-response',
        hostnameCheck: true,
        allowedVerifyHosts: ['api.hcaptcha.com'],
        allowedScriptHosts: ['js.hcaptcha.com'],
    );

    $errors = (new HCaptchaProvider($settings))->configurationErrors();

    expect($errors)->toContain('The site key is missing.')->and($errors)->toContain('The secret key is missing.');
});

it('knows when it still runs on the keys that shipped with the panel', function (): void {
    $shipped = new ProviderSettings(
        name: 'recaptcha',
        label: 'Google reCAPTCHA',
        enabled: true,
        siteKey: 'site-key',
        secretKey: 'secret-key',
        verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
        scriptUrl: 'https://www.google.com/recaptcha/api.js',
        tokenField: 'g-recaptcha-response',
        hostnameCheck: true,
        allowedVerifyHosts: ['www.google.com'],
        allowedScriptHosts: ['www.google.com'],
        shippedSiteKey: 'site-key',
        shippedSecretKey: 'secret-key',
    );

    expect($shipped->usesShippedKeys())->toBeTrue();
    expect(recaptchaSettings()->usesShippedKeys())->toBeFalse();
});

it('reports a disabled hCaptcha site key', function (): void {
    Http::fake([
        'https://api.hcaptcha.com/*' => Http::response(['success' => true, 'disabled' => ['some.sitekey']]),
    ]);

    $result = (new HCaptchaProvider(hcaptchaSettings()))->verify('token', null);

    expect($result->passed)->toBeFalse()
        ->and($result->reasons[0])->toStartWith('hCaptcha has this site key disabled');
});
