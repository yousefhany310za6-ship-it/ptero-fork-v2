<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Settings;

use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Pterodactyl\Captcha\Providers\ProviderRegistry;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

/**
 * The captcha settings an administrator saves: the master switch, the provider each action answers
 * with, its keys, and the rules. What is saved is flat and typed because that is exactly how the
 * settings table holds it.
 */
class UpdateCaptchaSettingsRequest extends AdminApiRequest
{
    /**
     * reCAPTCHA was configured under these keys before providers existed. Writing them keeps the
     * page that has always written them in agreement instead of leaving two switches for one thing.
     *
     * @var array<string, array<string, string>>
     */
    private const array LEGACY_KEYS = [
        'recaptcha' => [
            'enabled' => 'recaptcha:enabled',
            'site_key' => 'recaptcha:website_key',
            'secret_key' => 'recaptcha:secret_key',
        ],
    ];

    /**
     * Saving the rules is the only way to take one away, so this is the one endpoint a rule may never
     * answer for. Both forms are named because a rule can match either a path or a route name.
     */
    private const string ENDPOINT_PATH = 'api/admin/settings/captcha';

    private const string ENDPOINT_ROUTE = 'api.admin.settings.captcha.update';

    public function permissions(): array
    {
        return [Permissions::AdminSettingsUpdate];
    }

    /**
     * Validation rules for updating the captcha.
     *
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'default_provider' => ['required', 'string', Rule::in($this->providerNames())],
            'providers' => ['required', 'array'],
            'providers.*.name' => ['required', 'string', Rule::in($this->providerNames())],
            'providers.*.enabled' => ['required', 'boolean'],
            'providers.*.site_key' => ['nullable', 'string', 'max:191'],
            'providers.*.secret_key' => ['nullable', 'string', 'max:191'],
            'rules' => ['required', 'array'],
            'rules.*.key' => ['required', 'string', 'max:64'],
            'rules.*.path' => ['nullable', 'string', 'max:191'],
            'rules.*.route' => ['nullable', 'string', 'max:191'],
            'rules.*.methods' => ['required', 'array', 'min:1'],
            'rules.*.methods.*' => ['required', 'string', Rule::in(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])],
            'rules.*.provider' => ['nullable', 'string', Rule::in($this->providerNames())],
            'rules.*.required' => ['required', 'boolean'],
            'rules.*.action' => ['nullable', 'string', 'max:191'],
            'rules.*.require_action' => ['required', 'boolean'],
            'rules.*.hostname_check' => ['nullable', 'boolean'],
        ];
    }

    /**
     * A captcha that cannot work is refused here rather than saved and discovered at a login page.
     * Secret keys are the awkward part: an empty field means "unchanged", so what counts is the key
     * the panel would actually use, not what this form happens to have in it.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach ($this->knownProviders() as $provider) {
                $name = $provider['name'];

                if (! $provider['enabled']) {
                    continue;
                }

                foreach (['site_key' => $provider['site_key'], 'secret_key' => $provider['secret_key']] as $field => $sent) {
                    if ($this->effectiveKey($name, $sent, $field) === '') {
                        $validator->errors()->add(
                            "providers.$name.$field",
                            $this->registry()->get($name)?->label().' needs its '.($field === 'site_key' ? 'site' : 'secret').' key before it can be switched on.'
                        );
                    }
                }
            }

            foreach ((array) $this->input('rules', []) as $index => $rule) {
                if (! is_array($rule)) {
                    continue;
                }

                if ($this->gatesThisEndpoint($rule)) {
                    $validator->errors()->add(
                        "rules.$index.path",
                        'This is the endpoint that saves the rules, and this page renders no widget, so a rule for it could never be answered - nor removed again except from the database.'
                    );
                }

                if (! ($rule['require_action'] ?? false)) {
                    continue;
                }

                $provider = $rule['provider'] ?? null;

                if (is_string($provider) && $provider !== '' && $provider !== 'turnstile') {
                    $validator->errors()->add(
                        "rules.$index.require_action",
                        'Only Turnstile reports which action a response solved; '.$this->registry()->get($provider)?->label().' cannot be bound this way.'
                    );
                }
            }
        });
    }

    /**
     * Every setting this save touches, as the table stores it. A secret left blank in the form is
     * not written at all, so saving everything else never wipes a key that was already set.
     *
     * @param  list<string>|null  $only
     * @return array<string, string|null>
     */
    public function normalize(?array $only = null): array
    {
        $values = [
            'captcha:enabled' => $this->boolean('enabled') ? 'true' : 'false',
            'captcha:default_provider' => $this->string('default_provider')->toString(),
        ];

        foreach ($this->providersToSave() as $key => $value) {
            $values[$key] = $value;
        }

        $rules = [];

        foreach ((array) $this->input('rules', []) as $index => $rule) {
            if (! is_array($rule)) {
                continue;
            }

            $key = $rule['key'] ?? null;
            $stored = is_string($key) ? ($this->defaults()[$key] ?? []) : [];
            $rules[] = array_merge($stored, array_intersect_key($rule, array_flip([
                'key', 'path', 'route', 'methods', 'provider', 'required', 'action', 'require_action', 'hostname_check',
            ])));
        }

        $values[RuleRepository::KEY] = json_encode($rules, JSON_UNESCAPED_SLASHES) ?: null;

        return $values;
    }

    /**
     * Whether a rule would demand a captcha from the request that saves rules. Removing a rule is
     * only possible through this endpoint, so one that answers for it is a lock the panel throws
     * away. CaptchaRule::matches() is mirrored here rather than called, because a rule is validated
     * before there is a request with a route bound to it.
     *
     * @param  array<array-key, mixed>  $rule
     */
    private function gatesThisEndpoint(array $rule): bool
    {
        $methods = array_map(
            static fn (mixed $method): string => is_scalar($method) ? mb_strtoupper(trim((string) $method)) : '',
            is_array($rule['methods'] ?? null) ? $rule['methods'] : []
        );

        if (! in_array('PUT', $methods, true)) {
            return false;
        }

        $path = $this->pattern($rule['path'] ?? null);
        $route = $this->pattern($rule['route'] ?? null);

        if ($path === null && $route === null) {
            return false;
        }

        return ($path === null || Str::is($path, self::ENDPOINT_PATH))
            && ($route === null || Str::is($route, self::ENDPOINT_ROUTE));
    }

    /** A path or route pattern as the rule would apply it, or null when the rule left it blank. */
    private function pattern(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value, '/');

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @return array<string, string|null>
     */
    private function providersToSave(): array
    {
        $values = [];

        foreach ($this->knownProviders() as $provider) {
            $name = $provider['name'];
            $legacy = self::LEGACY_KEYS[$name] ?? [];

            $values[$legacy['enabled'] ?? "captcha:providers:$name:enabled"] = $provider['enabled'] ? 'true' : 'false';

            foreach (['site_key', 'secret_key'] as $field) {
                if ($provider[$field] !== '') {
                    $values[$legacy[$field] ?? "captcha:providers:$name:$field"] = $provider[$field];
                }
            }
        }

        return $values;
    }

    /**
     * The submitted providers this panel recognises, each with the three fields this form edits. An
     * entry naming something the registry does not know is left to the validation rules to reject.
     *
     * @return list<array{name: string, enabled: bool, site_key: string, secret_key: string}>
     */
    private function knownProviders(): array
    {
        $known = [];

        foreach ((array) $this->input('providers', []) as $provider) {
            $name = is_array($provider) ? ($provider['name'] ?? null) : null;

            if (! is_string($name) || ! $this->registry()->has($name)) {
                continue;
            }

            $known[] = [
                'name' => $name,
                'enabled' => filter_var($provider['enabled'] ?? false, FILTER_VALIDATE_BOOL),
                'site_key' => $this->submittedKey($provider, 'site_key'),
                'secret_key' => $this->submittedKey($provider, 'secret_key'),
            ];
        }

        return $known;
    }

    /**
     * A key as the form sent it, or empty when it sent nothing, which means "keep what is stored".
     *
     * @param  array<array-key, mixed>  $provider
     */
    private function submittedKey(array $provider, string $field): string
    {
        $sent = $provider[$field] ?? null;

        return is_string($sent) ? trim($sent) : '';
    }

    /** The key this provider would be left with after the save, whether or not the form sent one. */
    private function effectiveKey(string $provider, string $sent, string $field): string
    {
        if ($sent !== '') {
            return $sent;
        }

        $stored = self::LEGACY_KEYS[$provider][$field] ?? null;
        $path = $stored !== null
            ? str_replace(':', '.', $stored)
            : "captcha.providers.$provider.$field";

        $value = config($path);

        return is_string($value) ? trim($value) : '';
    }

    /** @return list<string> */
    private function providerNames(): array
    {
        return $this->registry()->names();
    }

    /** @return array<string, array<string, mixed>> */
    private function defaults(): array
    {
        return app(RuleRepository::class)->defaultAttributes();
    }

    private function registry(): ProviderRegistry
    {
        return app(ProviderRegistry::class);
    }
}
