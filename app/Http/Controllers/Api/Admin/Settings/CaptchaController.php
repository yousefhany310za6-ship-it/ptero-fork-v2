<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Settings;

use Illuminate\Http\JsonResponse;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Captcha\Contracts\CaptchaProvider;
use Pterodactyl\Captcha\Providers\ProviderRegistry;
use Pterodactyl\Captcha\Rules\CaptchaRule;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Pterodactyl\Extensions\Scribe\Attributes\ResponseField;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Settings\GetSettingsRequest;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Settings', 'View and update global panel settings.')]
class CaptchaController extends AdminApiController
{
    /**
     * The provider keys this panel answers for, as 'config/captcha.php' names them. A fourth provider
     * means a fourth entry here so the documented shape keeps matching what is really returned.
     */
    private const array PROVIDER_NAMES = ['recaptcha', 'hcaptcha', 'turnstile'];

    /**
     * One provider and one rule as they are really answered. A secret key is never among them: the
     * panel says whether one is stored and never what it is.
     */
    private const array CAPTCHA_EXAMPLE = [
        'enabled' => true,
        'default_provider' => 'recaptcha',
        'providers' => [
            [
                'name' => 'recaptcha',
                'label' => 'Google reCAPTCHA',
                'enabled' => true,
                'site_key' => '6LcJcjwUAAAAAO_Xqjrtj9wWufUpYRnK6BW8lnfn',
                'secret_key' => '',
                'has_secret' => true,
                'token_field' => 'g-recaptcha-response',
                'script_url' => 'https://www.google.com/recaptcha/api.js',
                'verify_url' => 'https://www.google.com/recaptcha/api/siteverify',
                'hostname_check' => true,
                'using_shipped_keys' => true,
                'errors' => ['The secret key is missing.'],
            ],
        ],
        'rules' => [
            [
                'key' => 'auth.forgot-password',
                'path' => 'auth/password',
                'route' => 'auth.post.forgot-password',
                'methods' => ['POST'],
                'provider' => 'recaptcha',
                'required' => true,
                'action' => 'request-reset',
                'require_action' => false,
                'hostname_check' => true,
                'label' => 'Auth Forgot Password',
                'wired' => true,
                'enforced' => true,
                'builtin' => true,
            ],
        ],
    ];

    public function __construct(
        private readonly ProviderRegistry $providers,
        private readonly RuleRepository $rules,
    ) {}

    /**
     * Return the captcha configuration.
     */
    #[Endpoint('Get captcha settings', 'Returns the captcha master switch, the state of every provider, and the rules that decide which action each one answers with. Secret keys are never returned.')]
    #[ResponseField('name', 'string', 'The provider key, as it is named when saving settings.', enum: self::PROVIDER_NAMES)]
    #[ResponseField('default_provider', 'string', 'The provider an action uses when its own rule names none.', enum: self::PROVIDER_NAMES)]
    #[ResponseField('provider', 'string', 'The provider this action asks; null leaves it on the default.', enum: [...self::PROVIDER_NAMES, null], nullable: true)]
    #[ResponseField('path', 'string', 'The path this action guards, without surrounding slashes; null when only a route names it.', nullable: true)]
    #[ResponseField('route', 'string', 'The route name this action guards; null when only a path names it.', nullable: true)]
    #[ResponseField('action', 'string', 'The Turnstile action a response must have solved; null binds nothing.', nullable: true)]
    #[ResponseField('hostname_check', 'boolean', 'Whether the host a response was solved on must match this panel; null defers to the provider.', nullable: true)]
    #[ScribeResponse(self::CAPTCHA_EXAMPLE, description: 'Captcha settings returned.')]
    public function __invoke(GetSettingsRequest $request): JsonResponse
    {
        $builtin = array_keys($this->rules->defaults());

        return new JsonResponse([
            'enabled' => config()->boolean('captcha.enabled', true),
            'default_provider' => $this->providers->defaultName(),
            'providers' => array_values(array_map(
                fn (CaptchaProvider $provider): array => $this->providerPayload($provider),
                $this->providers->all()
            )),
            'rules' => array_values(array_map(
                fn (CaptchaRule $rule): array => [
                    ...$rule->toArray(),
                    'label' => $rule->label(),
                    'wired' => $rule->isWired(),
                    'enforced' => $rule->isWired() && $rule->required && config()->boolean('captcha.enabled', true),
                    // A shipped action always comes back even if an administrator deletes it, so its
                    // endpoint is presented as fixed; only an added action is freely editable.
                    'builtin' => in_array($rule->key, $builtin, true),
                ],
                $this->rules->all()
            )),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function providerPayload(CaptchaProvider $provider): array
    {
        $settings = $provider->settings();

        return [
            'name' => $provider->name(),
            'label' => $provider->label(),
            'enabled' => $provider->isEnabled(),
            // The site key is on every page already; the secret key is never read back, exactly as
            // the rest of the settings API behaves.
            'site_key' => $settings->siteKey,
            'secret_key' => '',
            'has_secret' => $settings->secretKey !== '',
            'token_field' => $settings->tokenField,
            'script_url' => $settings->scriptUrl,
            'verify_url' => $settings->verifyUrl,
            'hostname_check' => $settings->hostnameCheck,
            'using_shipped_keys' => $settings->usesShippedKeys(),
            'errors' => $provider->configurationErrors(),
        ];
    }
}
