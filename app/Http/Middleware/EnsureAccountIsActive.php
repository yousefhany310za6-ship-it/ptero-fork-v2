<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Pterodactyl\Exceptions\Http\AccountSuspendedException;
use Pterodactyl\Models\User;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses a closed account on the ways it can already be inside the panel.
 *
 * It sits behind authentication — after `auth.session` on the browser routes and after the
 * token is resolved on the API — because it is not an authentication check. The person on the
 * other end has proved who they are; the account they proved is simply not allowed to do
 * anything, and the answer says so rather than asking them to sign in again.
 *
 * It reads `users.account_status` and nothing else, which is one column on a row that was
 * already loaded. Nothing here queries the suspension history: this runs on every request the
 * panel serves, including the ones a suspended account never reaches because its session was
 * closed on the first one.
 */
final class EnsureAccountIsActive
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();
        if (! $user instanceof User || ! $user->isSuspended()) {
            return $next($request);
        }

        $this->closeSession($request, $user);

        // A browser that simply asked for a page is sent to the sign-in screen, which is where
        // a suspended account learns what happened to it. Anything reading the response as
        // data is refused with the response, not moved.
        if ($request->is('api/*') || $request->expectsJson()) {
            throw new AccountSuspendedException();
        }

        return redirect()->to('/auth/login');
    }

    /**
     * Destroy the session that authenticated this request.
     *
     * Only that session: a request carrying an API token from a browser which is also signed in
     * as somebody else should refuse the token, not sign the other person out.
     */
    private function closeSession(Request $request, User $user): void
    {
        if (! $request->hasSession() || Auth::guard('web')->id() !== $user->id) {
            return;
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
