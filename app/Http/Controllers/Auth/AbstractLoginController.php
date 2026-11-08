<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Auth\Events\Failed;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\AccountSuspendedException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Security\LoginEventRecorder;
use Pterodactyl\Traits\Helpers\ThrottlesLogins;

abstract class AbstractLoginController extends Controller
{
    use ThrottlesLogins;

    public function __construct(protected readonly LoginEventRecorder $events) {}

    /**
     * Get the failed login response instance.
     *
     * @throws DisplayException
     */
    protected function sendFailedLoginResponse(Request $request, ?Authenticatable $user = null, ?string $message = null): never
    {
        $this->incrementLoginAttempts($request);
        $login = $request->string('user')->toString();
        $account = $user instanceof User ? $user : null;
        $this->events->failed($request, $account, LoginEventRecorder::failureReason($request, $account));
        $this->fireFailedLoginEvent($user, [
            $this->getField($login) => $login,
        ]);

        if ($request->route()?->named('auth.login-checkpoint')) {
            throw new DisplayException($message ?? trans('auth.two_factor.checkpoint_failed'));
        }

        throw new DisplayException(trans('auth.failed'));
    }

    /**
     * Send the response for a completed login step. The throttle is only
     * reset once a session exists, so a pending two-factor checkpoint keeps
     * counting failed attempts.
     */
    protected function sendLoginResponse(LoginResult $result, Request $request): JsonResponse
    {
        if ($result->complete) {
            $this->clearLoginAttempts($request);
            $this->events->success($request, $result->user);
        } else {
            $this->events->checkpoint($request, $result->user);
        }

        return new JsonResponse(['data' => $result->toResponseData()]);
    }

    /**
     * Refuse an account that is closed, before any session exists to be closed under it.
     *
     * This runs after the password has been verified and not before: until it has, the answer
     * would be telling anyone who asks which accounts are suspended. It does not count as a
     * failed attempt either — the credentials were right, and the account is not being asked to
     * try again.
     *
     * @throws AccountSuspendedException
     */
    protected function assertAccountMaySignIn(Request $request, User $user): void
    {
        if (! $user->isSuspended()) {
            return;
        }

        $suspension = $user->activeSuspension()->first();
        $this->events->suspended($request, $user, $suspension?->support_case_id);

        throw AccountSuspendedException::forSuspension($suspension);
    }

    /**
     * Determine if the user is logging in using an email or username.
     */
    protected function getField(?string $input = null): string
    {
        return ($input && str_contains($input, '@')) ? 'email' : 'username';
    }

    /**
     * Fire a failed login event.
     *
     * @param  array<string, string>  $credentials
     */
    protected function fireFailedLoginEvent(?Authenticatable $user = null, array $credentials = []): void
    {
        Event::dispatch(new Failed('auth', $user, $credentials));
    }
}
