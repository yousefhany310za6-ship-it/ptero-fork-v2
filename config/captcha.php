<?php

declare(strict_types=1);

use Pterodactyl\Captcha\Providers\HCaptchaProvider;
use Pterodactyl\Captcha\Providers\RecaptchaProvider;
use Pterodactyl\Captcha\Providers\TurnstileProvider;

/*
|--------------------------------------------------------------------------
| CAPTCHA
|--------------------------------------------------------------------------
|
| One place decides which actions are verified, with which provider, and how
| the verification is checked. Providers are classes; adding one is a class
| here and a block below. Nothing about a rule belongs in a controller or in
| a route file.
|
*/

return [
    /*
     * The master switch. Switching it off is an explicit administrative decision: it is the only
     * way verification stops, and a failing provider never turns it off on its own.
     */
    'enabled' => (bool) env('CAPTCHA_ENABLED', true),

    // The provider an action uses when its rule does not name one.
    'default_provider' => env('CAPTCHA_PROVIDER', 'recaptcha'),

    // Outbound calls to a provider: a slow provider is a failed verification, never a pass.
    'http' => [
        'timeout' => (int) env('CAPTCHA_TIMEOUT', 5),
        'connect_timeout' => (int) env('CAPTCHA_CONNECT_TIMEOUT', 2),
    ],

    // How long a spent token stays remembered, so the same one cannot be used twice.
    'replay' => [
        'ttl' => (int) env('CAPTCHA_REPLAY_TTL', 300),
    ],

    /*
     * Each provider is off until its own keys are set. The keys a root administrator saves on the
     * CAPTCHA settings page replace these, and only the site key is ever shown to a browser.
     *
     * "allow" is the only set of hosts a verification endpoint may point at; the administrator
     * cannot edit it, so a saved URL can never turn the panel into a request to an internal host.
     */
    'providers' => [
        'recaptcha' => [
            'class' => RecaptchaProvider::class,
            'label' => 'Google reCAPTCHA',
            'enabled' => (bool) env('RECAPTCHA_ENABLED', true),
            'site_key' => env('RECAPTCHA_WEBSITE_KEY', '6LcJcjwUAAAAAO_Xqjrtj9wWufUpYRnK6BW8lnfn'),
            'secret_key' => env('RECAPTCHA_SECRET_KEY', '6LcJcjwUAAAAALOcDJqAEYKTDhwELCkzUkNDQ0J5'),
            // The keys that ship with the panel; using them is warned about, and they are public.
            '_shipped_site_key' => '6LcJcjwUAAAAAO_Xqjrtj9wWufUpYRnK6BW8lnfn',
            '_shipped_secret_key' => '6LcJcjwUAAAAALOcDJqAEYKTDhwELCkzUkNDQ0J5',
            'verify_url' => env('RECAPTCHA_DOMAIN', 'https://www.google.com/recaptcha/api/siteverify'),
            'script_url' => env('RECAPTCHA_SCRIPT_URL', 'https://www.google.com/recaptcha/api.js'),
            'token_field' => 'g-recaptcha-response',
            // Public site keys cannot have domain pinning on Google's side, so the panel compares.
            'hostname_check' => (bool) env('RECAPTCHA_HOSTNAME_CHECK', true),
            'allow' => [
                'verify_hosts' => ['www.google.com', 'www.recaptcha.net'],
                'script_hosts' => ['www.google.com', 'www.recaptcha.net'],
            ],
        ],
        'hcaptcha' => [
            'class' => HCaptchaProvider::class,
            'label' => 'hCaptcha',
            'enabled' => (bool) env('HCAPTCHA_ENABLED', false),
            'site_key' => env('HCAPTCHA_SITE_KEY', ''),
            'secret_key' => env('HCAPTCHA_SECRET_KEY', ''),
            'verify_url' => env('HCAPTCHA_VERIFY_URL', 'https://api.hcaptcha.com/siteverify'),
            'script_url' => env('HCAPTCHA_SCRIPT_URL', 'https://js.hcaptcha.com/1/api.js'),
            'token_field' => 'h-captcha-response',
            'hostname_check' => (bool) env('HCAPTCHA_HOSTNAME_CHECK', true),
            'allow' => [
                'verify_hosts' => ['api.hcaptcha.com'],
                'script_hosts' => ['js.hcaptcha.com', 'newassets.hcaptcha.com'],
            ],
        ],
        'turnstile' => [
            'class' => TurnstileProvider::class,
            'label' => 'Cloudflare Turnstile',
            'enabled' => (bool) env('TURNSTILE_ENABLED', false),
            'site_key' => env('TURNSTILE_SITE_KEY', ''),
            'secret_key' => env('TURNSTILE_SECRET_KEY', ''),
            'verify_url' => env('TURNSTILE_VERIFY_URL', 'https://challenges.cloudflare.com/turnstile/v0/siteverify'),
            'script_url' => env('TURNSTILE_SCRIPT_URL', 'https://challenges.cloudflare.com/turnstile/v0/api.js'),
            'token_field' => 'cf-turnstile-response',
            'hostname_check' => (bool) env('TURNSTILE_HOSTNAME_CHECK', true),
            'allow' => [
                'verify_hosts' => ['challenges.cloudflare.com'],
                'script_hosts' => ['challenges.cloudflare.com'],
            ],
        ],
    ],
];
