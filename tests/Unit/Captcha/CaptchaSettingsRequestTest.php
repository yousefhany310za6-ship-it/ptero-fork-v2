<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Validator as ValidatorInstance;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Pterodactyl\Http\Requests\Api\Admin\Settings\UpdateCaptchaSettingsRequest;

/**
 * The settings page saves providers as a list that names each one, because a list is what survives a
 * round trip through JSON: an object keyed by provider would arrive as a list of integers and every
 * provider setting would be quietly skipped.
 *
 * @param  array<string, mixed>  $payload
 */
function captchaSettingsRequest(array $payload): UpdateCaptchaSettingsRequest
{
    /** @var UpdateCaptchaSettingsRequest $request */
    $request = UpdateCaptchaSettingsRequest::create('/api/admin/settings/captcha', 'PUT', $payload);

    return $request;
}

/**
 * @param  array<string, mixed>  $payload
 */
function captchaSettingsValidator(array $payload): ValidatorInstance
{
    $request = captchaSettingsRequest($payload);
    $validator = Validator::make($payload, $request->rules());
    $request->withValidator($validator);

    return $validator;
}

/** @return array<string, mixed> */
function captchaSettingsPayload(): array
{
    return [
        'enabled' => true,
        'default_provider' => 'turnstile',
        'providers' => [
            ['name' => 'recaptcha', 'enabled' => true, 'site_key' => 'site-one', 'secret_key' => ''],
            ['name' => 'hcaptcha', 'enabled' => true, 'site_key' => 'site-two', 'secret_key' => 'secret-two'],
            ['name' => 'turnstile', 'enabled' => false, 'site_key' => '', 'secret_key' => ''],
        ],
        'rules' => [
            [
                'key' => 'auth.login',
                'path' => 'auth/login',
                'route' => null,
                'methods' => ['POST'],
                'provider' => 'turnstile',
                'required' => true,
                'action' => null,
                'require_action' => false,
                'hostname_check' => null,
            ],
            [
                'key' => 'server.database.create',
                'path' => 'api/client/servers/*/databases',
                'route' => null,
                'methods' => ['POST'],
                'provider' => 'hcaptcha',
                'required' => true,
                'action' => null,
                'require_action' => false,
                'hostname_check' => false,
            ],
        ],
    ];
}

/** @return array<string, string|null> */
function captchaSettingsSaved(): array
{
    return captchaSettingsRequest(captchaSettingsPayload())->normalize();
}

/** @return array<string, array<string, mixed>> */
function captchaRulesSaved(): array
{
    $saved = json_decode(captchaSettingsSaved()[RuleRepository::KEY], true, flags: JSON_THROW_ON_ERROR);
    $indexed = [];

    foreach ($saved as $rule) {
        $indexed[$rule['key']] = $rule;
    }

    return $indexed;
}

it('writes each provider under the key the panel reads it back from', function (): void {
    $saved = captchaSettingsSaved();

    // reCAPTCHA is still saved under the keys the panel used before providers existed.
    expect($saved['recaptcha:enabled'])->toBe('true')
        ->and($saved['recaptcha:website_key'])->toBe('site-one')
        ->and($saved['captcha:providers:hcaptcha:enabled'])->toBe('true')
        ->and($saved['captcha:providers:hcaptcha:site_key'])->toBe('site-two')
        ->and($saved['captcha:providers:turnstile:enabled'])->toBe('false')
        ->and($saved['captcha:enabled'])->toBe('true')
        ->and($saved['captcha:default_provider'])->toBe('turnstile');
});

it('leaves a stored secret alone when the form sent a blank one', function (): void {
    $saved = captchaSettingsSaved();

    expect($saved)->not->toHaveKey('recaptcha:secret_key')
        ->and($saved['captcha:providers:hcaptcha:secret_key'])->toBe('secret-two')
        ->and($saved)->not->toHaveKey('captcha:providers:turnstile:secret_key');
});

it('stores the whole rule list, keeping a shipped action on its own endpoint', function (): void {
    $rules = captchaRulesSaved();

    expect($rules)->toHaveKeys(['auth.login', 'server.database.create'])
        ->and($rules['auth.login']['path'])->toBe('auth/login')
        ->and($rules['auth.login']['provider'])->toBe('turnstile')
        ->and($rules['server.database.create']['path'])->toBe('api/client/servers/*/databases')
        ->and($rules['server.database.create']['hostname_check'])->toBeFalse();
});

it('refuses to switch on a provider whose keys would be left missing', function (): void {
    $payload = captchaSettingsPayload();

    $payload['providers'][0]['site_key'] = '';
    $payload['providers'][0]['secret_key'] = '';

    // The keys this panel would fall back to if the form sent nothing.
    config(['recaptcha.website_key' => '', 'recaptcha.secret_key' => '']);

    $validator = captchaSettingsValidator($payload);

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('providers.recaptcha.site_key'))->toBeTrue()
        ->and($validator->errors()->has('providers.recaptcha.secret_key'))->toBeTrue()
        // A provider left switched off is allowed to have nothing set.
        ->and($validator->errors()->has('providers.turnstile.site_key'))->toBeFalse();
});

it('keeps a provider switched on when a blank field leaves a stored key in place', function (): void {
    $payload = captchaSettingsPayload();

    $payload['providers'][0]['site_key'] = '';
    $payload['providers'][0]['secret_key'] = '';

    config(['recaptcha.website_key' => 'stored-site', 'recaptcha.secret_key' => 'stored-secret']);

    expect(captchaSettingsValidator($payload)->fails())->toBeFalse();
});

it('refuses a provider name the panel does not know', function (): void {
    $payload = captchaSettingsPayload();

    $payload['providers'][0]['name'] = 'coldfusion';

    expect(captchaSettingsValidator($payload)->fails())->toBeTrue();
});

it('refuses to bind an action to a provider that cannot report one', function (): void {
    $payload = captchaSettingsPayload();

    $payload['rules'][1]['action'] = 'create-database';
    $payload['rules'][1]['require_action'] = true;

    $validator = captchaSettingsValidator($payload);

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('rules.1.require_action'))->toBeTrue();
});

/**
 * A rule written as the settings page sends it, with only the endpoint fields worth naming.
 *
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function captchaRule(string $key, array $overrides = []): array
{
    return array_merge([
        'key' => $key,
        'path' => 'api/client/servers',
        'route' => null,
        'methods' => ['POST'],
        'provider' => null,
        'required' => true,
        'action' => null,
        'require_action' => false,
        'hostname_check' => null,
    ], $overrides);
}

it('refuses a rule that would guard the endpoint that saves the rules', function (array $endpoint): void {
    $payload = captchaSettingsPayload();

    $payload['rules'][2] = captchaRule('admin.captcha.settings', $endpoint);

    $validator = captchaSettingsValidator($payload);

    expect($validator->fails())->toBeTrue()
        ->and($validator->errors()->has('rules.2.path'))->toBeTrue();
})->with([
    'the path itself' => [['path' => 'api/admin/settings/captcha', 'methods' => ['PUT']]],
    'a wildcard above it' => [['path' => 'api/admin/*', 'methods' => ['PUT', 'POST']]],
    'the route name' => [['path' => null, 'route' => 'api.admin.settings.captcha.update', 'methods' => ['PUT']]],
    'a route name pattern' => [['path' => null, 'route' => 'api.admin.settings.*', 'methods' => ['PUT']]],
]);

it('leaves a rule alone when it cannot reach the settings save', function (array $endpoint): void {
    $payload = captchaSettingsPayload();

    $payload['rules'][2] = captchaRule('admin.captcha.settings', $endpoint);

    expect(captchaSettingsValidator($payload)->fails())->toBeFalse();
})->with([
    'a different verb' => [['path' => 'api/admin/settings/captcha', 'methods' => ['POST']]],
    'a different endpoint' => [['path' => 'api/admin/settings/mail', 'methods' => ['PUT']]],
    'one segment only' => [['path' => 'api', 'methods' => ['PUT']]],
    'an unwired rule' => [['path' => null, 'route' => null, 'methods' => ['PUT']]],
]);
