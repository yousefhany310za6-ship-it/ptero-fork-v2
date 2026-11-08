<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Rules;

use Pterodactyl\Models\Setting;

/**
 * The list of actions the panel verifies, stored as one JSON setting so that a rule is data an
 * administrator edits rather than a condition a developer has to find and change.
 *
 * The defaults below are what the panel did before rules existed at all: login, the forgot-password
 * mail and the password reset each required a token. Deleting the stored setting returns to them,
 * and a setting that cannot be parsed is ignored in favour of them - never in favour of no checks.
 */
class RuleRepository
{
    /** The settings row the rules are stored in, without and with the table's prefix. */
    public const string KEY = 'captcha:rules';

    public const string SETTING_KEY = 'settings::captcha:rules';

    /** @var array<string, CaptchaRule>|null */
    private ?array $rules = null;

    /** @return array<string, CaptchaRule> */
    public function all(): array
    {
        return $this->rules ??= $this->read();
    }

    public function get(string $key): ?CaptchaRule
    {
        return $this->all()[$key] ?? null;
    }

    /**
     * @param  iterable<int|string, CaptchaRule|array<array-key, mixed>>  $rules
     * @return list<CaptchaRule>
     */
    public function save(iterable $rules): array
    {
        $stored = [];

        foreach ($rules as $key => $rule) {
            $rule = $rule instanceof CaptchaRule ? $rule : CaptchaRule::fromArray($rule, (string) $key);

            if ($rule->key === '') {
                continue;
            }

            $stored[$rule->key] = $rule->toArray();
        }

        $json = json_encode($stored, JSON_UNESCAPED_SLASHES);

        // A value that cannot be encoded stores nothing, and nothing means the shipped defaults -
        // never a panel with no checks.
        Setting::put(self::SETTING_KEY, $json === false ? null : $json);

        $this->rules = null;

        return array_values($this->all());
    }

    /** @return array<string, CaptchaRule> */
    public function defaults(): array
    {
        $rules = [];

        foreach ($this->defaultAttributes() as $key => $attributes) {
            $rules[$key] = CaptchaRule::fromArray($attributes, (string) $key);
        }

        return $rules;
    }

    /**
     * The actions the panel knows about. Ones without an endpoint are listed for the administrator
     * because they are the obvious next checks to wire up, not because anything verifies them now.
     *
     * @return array<string, array<string, mixed>>
     */
    public function defaultAttributes(): array
    {
        return [
            'auth.login' => [
                'path' => 'auth/login',
                'route' => null,
                'methods' => ['POST'],
                'provider' => null,
                'required' => true,
            ],
            'auth.forgot-password' => [
                'path' => 'auth/password',
                'route' => 'auth.post.forgot-password',
                'methods' => ['POST'],
                'provider' => null,
                'required' => true,
            ],
            'auth.reset-password' => [
                'path' => 'auth/password/reset',
                'route' => 'auth.reset-password',
                'methods' => ['POST'],
                'provider' => null,
                'required' => true,
            ],
            // Reached only after a password is accepted, and the login page that gets here does not
            // render a widget, so it stays unenforced until a form can answer for it.
            'auth.checkpoint' => [
                'path' => 'auth/login/checkpoint',
                'route' => 'auth.login-checkpoint',
                'methods' => ['POST'],
                'required' => false,
            ],
            // No registration endpoint exists in this version of the panel; the rule is here so the
            // provider choice is already made when one does.
            'auth.register' => [
                'path' => null,
                'methods' => ['POST'],
                'required' => true,
            ],
        ];
    }

    /** @return array<string, CaptchaRule> */
    private function read(): array
    {
        $stored = Setting::fetch(self::SETTING_KEY);

        if ($stored === null || trim($stored) === '') {
            return $this->defaults();
        }

        $decoded = json_decode($stored, true);

        if (! is_array($decoded) || $decoded === []) {
            return $this->defaults();
        }

        $defaults = $this->defaults();
        $rules = [];

        foreach ($decoded as $key => $attributes) {
            if (! is_array($attributes)) {
                continue;
            }

            $rule = CaptchaRule::fromArray($attributes, (string) $key);

            if ($rule->key === '') {
                continue;
            }

            // A shipped action can be loosened but never deleted: an administrator who removes it
            // from the list gets it back from the defaults, so the auth checks cannot vanish by
            // accident. Loosening one is done with its own settings, in the open.
            $rules[$rule->key] = $rule;
            unset($defaults[$rule->key]);
        }

        return array_merge($rules, $defaults);
    }
}
