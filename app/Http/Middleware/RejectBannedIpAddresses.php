<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Services\Security\ClientIpResolver;
use Pterodactyl\Services\Security\IpBanService;
use Pterodactyl\Services\Security\LoginEventRecorder;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * Refuses a banned address before anything about the request is acted upon.
 *
 * It runs at the head of the `web` and `api` middleware groups, which is what gives the
 * refusal its teeth: the session has not started, so no session row or cookie exists for a
 * rejected client to keep hammering with; the CSRF token, the captcha, and the login
 * throttle have not run, so the answer costs one cache read and reveals nothing about
 * which account was being tried; and TrustProxies, a global middleware, has already run, so
 * the address being matched is the one the panel is willing to believe.
 */
final class RejectBannedIpAddresses
{
    /**
     * The sign-in endpoints. A GET of these serves the SPA shell and is left alone — the
     * address is refused when it tries to do something. Logging out is deliberately absent:
     * a session that is already open should always be closable.
     */
    private const array REFUSED_PATHS = [
        'auth/login',
        'auth/login/checkpoint',
        'auth/password',
        'auth/password/reset',
    ];

    public function __construct(
        private readonly IpBanService $bans,
        private readonly LoginEventRecorder $events,
    ) {}

    /**
     * @param  Closure(Request): SymfonyResponse  $next
     */
    public function handle(Request $request, Closure $next): SymfonyResponse
    {
        if (! $this->isEnforced($request)) {
            return $next($request);
        }

        $address = ClientIpResolver::resolve($request);

        // An attempt that cannot be attributed to an address is refused rather than let
        // through: not knowing the client is exactly what a request built to walk past a
        // ban looks like, and no legitimate sign-in arrives without one.
        if ($address === null) {
            $this->events->banned($request, null);

            return $this->refuse();
        }

        $banId = $this->bans->match($address);
        if ($banId !== null) {
            $this->events->banned($request, $banId);

            return $this->refuse();
        }

        return $next($request);
    }

    private function isEnforced(Request $request): bool
    {
        if ($request->is(self::REFUSED_PATHS)) {
            // A GET of these serves the SPA shell, which contains nothing worth refusing;
            // it is the sign-in itself that is the action.
            return ! $request->isMethod('GET');
        }

        // Off by default. A ban is a sign-in restriction; extending it to key-authenticated
        // traffic would also cut off the integrations and the administrator's own panel that
        // legitimately run from the same address, and the ban list is where it is lifted.
        // The admin routes stay exempt even when this is on, so a ban can always be undone.
        return (bool) config('pterodactyl.security.ban_blocks_api_requests')
            && $request->is('api/client', 'api/client/*', 'api/application', 'api/application/*');
    }

    /**
     * A flat refusal, in the shape the SPA already renders as a toast. It names no account,
     * no ban reason, and no expiry, because none of that is information the requester is
     * entitled to.
     */
    private function refuse(): JsonResponse
    {
        return new JsonResponse([
            'errors' => [
                [
                    'code' => 'IpRestricted',
                    'status' => (string) Response::HTTP_FORBIDDEN,
                    'detail' => 'Access from this network address is not permitted. Contact support if you believe this is a mistake.',
                ],
            ],
        ], Response::HTTP_FORBIDDEN);
    }
}
