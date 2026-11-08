<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pterodactyl\Captcha\CaptchaVerifier;

/**
 * Verifies the captcha of a request against the rule that speaks for it. Which provider answers,
 * whether a response is mandatory, and how strictly it is read are all decided in the rules, not
 * here: this is the place a check is asked for, nothing else.
 *
 * The optional parameter names the rule directly ('captcha:auth.login'). Without it the rule is
 * found from the request itself, which is what lets a new endpoint be protected by data alone.
 *
 * Used without a parameter - the way the web and api groups use it on every request - it stands
 * aside when the route already declares its own captcha middleware, so that a check which was
 * always ordered after the throttle of its route stays ordered after it.
 */
class VerifyCaptcha
{
    public function __construct(private readonly CaptchaVerifier $verifier) {}

    /**
     * @param  Closure(Request): \Symfony\Component\HttpFoundation\Response  $next
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next, ?string $action = null): mixed
    {
        if ($action === null && $this->claimedByRoute($request)) {
            return $next($request);
        }

        $this->verifier->check($request, $action);

        return $next($request);
    }

    /** True when the matched route declares 'captcha' or the deprecated 'recaptcha' itself. */
    private function claimedByRoute(Request $request): bool
    {
        $route = $request->route();

        if ($route === null) {
            return false;
        }

        foreach ($route->gatherMiddleware() as $middleware) {
            if (! is_string($middleware)) {
                continue;
            }

            $name = Str::before($middleware, ':');

            if ($name === 'captcha' || $name === 'recaptcha') {
                return true;
            }
        }

        return false;
    }
}
