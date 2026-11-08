<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Pterodactyl\Captcha\CaptchaVerifier;

/**
 * The name this check was always installed under. It is kept because an extension or an older route
 * file may still ask for 'recaptcha', and because an upgrade should not break the routes it did not
 * write. What it does is ask the rules which provider answers for the request and verify it - the
 * single implementation now lives in CaptchaVerifier.
 *
 * @deprecated use the 'captcha' alias, which names the action being verified.
 */
class VerifyReCaptcha
{
    public function __construct(private readonly CaptchaVerifier $verifier) {}

    /**
     * @param  Closure(Request): \Symfony\Component\HttpFoundation\Response  $next
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $this->verifier->check($request);

        return $next($request);
    }
}
