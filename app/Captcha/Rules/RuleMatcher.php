<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha\Rules;

use Illuminate\Http\Request;

/**
 * Finds the rule that speaks for an incoming request, so that no route file or controller has to
 * say which provider protects it or whether a response is mandatory.
 */
class RuleMatcher
{
    public function __construct(private readonly RuleRepository $rules) {}

    /** The rule for this request, or null when no action claims it. */
    public function forRequest(Request $request): ?CaptchaRule
    {
        foreach ($this->rules->all() as $rule) {
            if ($rule->isWired() && $rule->matches($request)) {
                return $rule;
            }
        }

        return null;
    }

    public function forKey(string $key): ?CaptchaRule
    {
        return $this->rules->get($key);
    }
}
