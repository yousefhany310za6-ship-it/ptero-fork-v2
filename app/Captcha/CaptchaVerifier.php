<?php

declare(strict_types=1);

namespace Pterodactyl\Captcha;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Captcha\Contracts\CaptchaProvider;
use Pterodactyl\Captcha\Providers\ProviderRegistry;
use Pterodactyl\Captcha\Rules\CaptchaRule;
use Pterodactyl\Captcha\Rules\RuleMatcher;
use Pterodactyl\Captcha\Rules\RuleRepository;
use Pterodactyl\Captcha\Value\VerificationResult;
use Pterodactyl\Events\Auth\FailedCaptcha;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

/**
 * The one place that decides whether a request may proceed. A rule says what an action needs, a
 * provider says what it saw, and everything in between - a token that is missing, spent, expired,
 * bound to a different action, or solved on a different host - is checked here.
 *
 * Every path that cannot prove the token fails. An unreachable provider, a provider answering with
 * nonsense, a cache that will not record a spent token: none of them lets the request through, and
 * none of them switches anything off. The only way verification stops is an administrator saying so
 * in the master switch.
 */
class CaptchaVerifier
{
    private const REJECT_MESSAGE = 'Failed to validate the captcha response.';

    /** Marks a request this application has already proven, so no second check relives its token. */
    private const string VERIFIED_ATTRIBUTE = 'captcha.verified';

    public function __construct(
        private readonly ProviderRegistry $providers,
        private readonly RuleRepository $rules,
        private readonly RuleMatcher $matcher,
    ) {}

    public function check(Request $request, ?string $action = null): void
    {
        // The central hook and an explicit 'captcha:action' can both speak for one route, and a
        // second check of a spent token would read as a replay. One proof per request is enough.
        if ($request->attributes->get(self::VERIFIED_ATTRIBUTE) === true) {
            return;
        }

        $this->verify($request, $action);

        // verify throws whenever it cannot prove the request, so reaching here is itself the proof.
        $request->attributes->set(self::VERIFIED_ATTRIBUTE, true);
    }

    /**
     * What a browser needs to render a widget: which provider answers for which action, its public
     * site key, its script, and the field the token must come back in. Secret keys are never part of
     * this, and actions that are not enforced do not appear.
     *
     * @return array<string, mixed>
     */
    public function widgetConfiguration(): array
    {
        if (! $this->isEnabled()) {
            return ['enabled' => false, 'actions' => []] + $this->publicProviderShape(null);
        }

        $actions = [];

        foreach ($this->rules->all() as $key => $rule) {
            if (! $rule->isWired() || ! $rule->required) {
                continue;
            }

            $provider = $this->providers->resolve($rule->provider)->provider;

            if ($provider === null) {
                continue;
            }

            $actions[$key] = $this->publicProviderShape($provider);
        }

        $first = $this->providers->resolve(null);

        return [
            'enabled' => $actions !== [],
            'actions' => $actions,
        ] + $this->publicProviderShape($first->provider);
    }

    public function isEnabled(): bool
    {
        return config()->boolean('captcha.enabled', true);
    }

    /**
     * Prove this request, or throw. Passing means the provider said yes and every claim in its
     * answer held up against what the panel already knew.
     */
    private function verify(Request $request, ?string $action): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $rule = $this->ruleFor($request, $action);

        if ($rule === null) {
            // The central hook asks of every request, and most are claimed by no rule; a request
            // never conjures a rule into being. But a check that names an action the panel has no
            // rule for has broken wiring, and broken wiring must not read as "no captcha needed".
            if ($action === null || $action === '') {
                return;
            }

            $this->reject($request, null, null, ['the panel has no rule for "'.$action.'"']);
        }

        $choice = $this->providers->resolve($rule->provider);

        if (! $choice->isVerified()) {
            // Nothing can verify this action. Which of the two reasons that is decides everything:
            // every provider switched off is an administrator's choice, and the panel says so out
            // loud; a provider switched on but broken is not a choice to go without a captcha, and
            // quietly letting the request through would turn a half-finished setup into an open door.
            if ($this->providers->enabledNames() === []) {
                return;
            }

            if ($rule->required) {
                $this->reject($request, $rule, null, ['no captcha provider is available', ...$choice->warnings]);
            }

            return;
        }

        $provider = $choice->provider;

        if ($provider === null) {
            // isVerified() guarantees a provider; this only states the guarantee where the type
            // system can see it, so no path below ever has to ask whether $provider exists.
            $this->reject($request, $rule, null, ['no captcha provider is answering this action']);
        }

        foreach ($choice->warnings as $warning) {
            Log::notice('[captcha] A provider could not be used, another one is answering instead.', [
                'captcha_action' => $rule->key,
                'captcha_provider' => $provider->name(),
                'captcha_reason' => $warning,
            ]);
        }

        $field = $provider->tokenField();
        $token = is_string($request->input($field)) ? trim((string) $request->input($field)) : '';

        if ($token === '') {
            if ($this->foreignToken($request, $provider) !== null) {
                $this->reject($request, $rule, $provider, ['the response was submitted under another provider field']);
            }

            if ($rule->required) {
                $this->reject($request, $rule, $provider, ['no captcha response was submitted']);
            }

            return;
        }

        if (! $this->recordUse($provider, $token)) {
            $this->reject($request, $rule, $provider, ['this captcha response has already been used']);
        }

        $result = $provider->verify($token, $request->ip());

        if (! $result->passed) {
            $this->reject($request, $rule, $provider, $result->reasons, $result);
        }

        if (($reason = $this->expiryReason($result)) !== null) {
            $this->reject($request, $rule, $provider, [$reason], $result);
        }

        if (($reason = $this->actionReason($rule, $result)) !== null) {
            $this->reject($request, $rule, $provider, [$reason], $result);
        }

        if ($this->shouldCheckHostname($rule, $provider) && ! $this->hostnameMatches($request, $result->hostname)) {
            $this->reject($request, $rule, $provider, ['the response was solved for "'.$result->hostname.'"'], $result);
        }
    }

    private function ruleFor(Request $request, ?string $action): ?CaptchaRule
    {
        return $action !== null && $action !== ''
            ? $this->matcher->forKey($action)
            : $this->matcher->forRequest($request);
    }

    /**
     * A token arriving under a different provider's field is not this provider's token. Accepting it
     * would let one provider's answer unlock another provider's action.
     */
    private function foreignToken(Request $request, CaptchaProvider $provider): ?string
    {
        foreach ($this->providers->all() as $other) {
            if ($other->name() === $provider->name()) {
                continue;
            }

            $value = $request->input($other->tokenField());

            if (is_string($value) && trim($value) !== '') {
                return $other->tokenField();
            }
        }

        return null;
    }

    /**
     * Remembers that this token has been spent. The token itself is never stored: its hash is the
     * key, so a cache dump cannot hand anyone a replay.
     */
    private function recordUse(CaptchaProvider $provider, string $token): bool
    {
        $key = 'captcha:used:'.hash('sha256', $provider->name().'|'.$token);

        try {
            return Cache::add($key, 1, (int) config('captcha.replay.ttl', 300));
        } catch (Throwable $exception) {
            Log::error('[captcha] The panel could not record a spent response.', [
                'exception' => $exception,
                'captcha_provider' => $provider->name(),
            ]);

            return false;
        }
    }

    private function expiryReason(VerificationResult $result): ?string
    {
        if ($result->expiresAt === null || $result->expiresAt > time()) {
            return null;
        }

        return 'this captcha response is no longer valid';
    }

    /**
     * Ties the response to the operation it was meant for. Turnstile echoes the action it was
     * rendered with; reCAPTCHA and hCaptcha do not, so an action rule on those providers can never
     * be satisfied - which is why the panel refuses rather than guessing.
     */
    private function actionReason(CaptchaRule $rule, VerificationResult $result): ?string
    {
        if (! $rule->requireAction) {
            return null;
        }

        if ($result->action === null) {
            return 'the provider did not report which action this response solved';
        }

        if ($rule->action !== null && ! hash_equals($rule->action, $result->action)) {
            return 'this captcha response was solved for a different action';
        }

        return null;
    }

    private function shouldCheckHostname(CaptchaRule $rule, CaptchaProvider $provider): bool
    {
        return $rule->hostnameCheck ?? $provider->settings()->hostnameCheck;
    }

    private function hostnameMatches(Request $request, ?string $hostname): bool
    {
        if ($hostname === null || $hostname === '') {
            return false;
        }

        $parsed = parse_url($request->url());

        if (! is_array($parsed) || ! isset($parsed['host'])) {
            return false;
        }

        return strcasecmp($parsed['host'], $hostname) === 0;
    }

    /**
     * Say what failed in the log, where an administrator can read it, and give the browser nothing
     * but a rejection. Reasons and provider codes never reach a response body.
     *
     * @param  list<string>  $reasons
     */
    private function reject(
        Request $request,
        ?CaptchaRule $rule,
        ?CaptchaProvider $provider,
        array $reasons,
        ?VerificationResult $result = null,
    ): never {
        event(new FailedCaptcha($request->ip() ?? 'unknown', $result->hostname ?? 'unknown'));

        Log::warning('[captcha] Rejected a request.', [
            'captcha_action' => $rule->key ?? 'unruled',
            'captcha_provider' => $provider?->name() ?? 'none',
            'captcha_reasons' => $reasons,
            'captcha_error_codes' => $result->errorCodes ?? [],
            'path' => $request->path(),
        ]);

        throw new HttpException(Response::HTTP_BAD_REQUEST, self::REJECT_MESSAGE);
    }

    /**
     * The public half of a provider. camelCase because it is read by the frontend, and empty because
     * a widget needs a site key, a script and a field name - never a secret.
     *
     * @return array<string, mixed>
     */
    private function publicProviderShape(?CaptchaProvider $provider): array
    {
        if ($provider === null) {
            return ['provider' => null, 'siteKey' => null, 'scriptUrl' => null, 'tokenField' => null];
        }

        return [
            'provider' => $provider->name(),
            'siteKey' => $provider->siteKey(),
            'scriptUrl' => $provider->scriptUrl(),
            'tokenField' => $provider->tokenField(),
        ];
    }
}
