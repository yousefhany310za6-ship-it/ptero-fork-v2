<?php

declare(strict_types=1);

use Pterodactyl\Http\Controllers\Api\Admin\Settings\CaptchaController;
use Pterodactyl\Http\Requests\Api\Admin\Settings\GetSettingsRequest;

/**
 * @return array<string, mixed>
 */
function captchaSettingsResponse(): array
{
    $response = app(CaptchaController::class)(GetSettingsRequest::create('/api/admin/settings/captcha', 'GET'));

    /** @var array<string, mixed> $payload */
    $payload = json_decode($response->getContent(), true, flags: JSON_THROW_ON_ERROR);

    return $payload;
}

it('answers the settings page with providers as a list that names each one', function (): void {
    $payload = captchaSettingsResponse();

    /** @var array<int, array<string, mixed>> $providers */
    $providers = $payload['providers'];
    $names = array_column($providers, 'name');

    expect($names)->toBe(['recaptcha', 'hcaptcha', 'turnstile'])
        ->and($providers[0]['label'])->toBe('Google reCAPTCHA');
});

it('never reads a stored secret back to the page', function (): void {
    config([
        'captcha.providers.hcaptcha.enabled' => true,
        'captcha.providers.hcaptcha.secret_key' => 'a-stored-secret',
    ]);

    /** @var array<int, array<string, mixed>> $providers */
    $providers = captchaSettingsResponse()['providers'];
    $hcaptcha = array_column($providers, null, 'name')['hcaptcha'];

    expect($hcaptcha['secret_key'])->toBe('')
        ->and($hcaptcha['has_secret'])->toBeTrue()
        // The value itself appears nowhere in what the page is given.
        ->and(json_encode(captchaSettingsResponse()))->not->toContain('a-stored-secret');
});

it('says which actions the panel ships with, so their endpoints stay fixed', function (): void {
    /** @var array<int, array<string, mixed>> $rules */
    $rules = captchaSettingsResponse()['rules'];
    $byKey = array_column($rules, null, 'key');

    expect($byKey['auth.login']['builtin'])->toBeTrue()
        ->and($byKey['auth.login']['wired'])->toBeTrue()
        ->and($byKey['auth.register']['builtin'])->toBeTrue()
        // Nothing is enforced for an action that has no endpoint to guard.
        ->and($byKey['auth.register']['wired'])->toBeFalse();
});
