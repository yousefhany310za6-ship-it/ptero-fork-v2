<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Security;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Support\ClientFingerprint;

/**
 * Writes the sign-in history, and is the only place that does.
 *
 * Two rules shape everything here. The first is that history never gets in the way of
 * signing in: a database fault on this table costs a row, not the login, so a write failure
 * is counted in the log and passed over. The second is that history never becomes a denial of
 * service: an unauthenticated flood reaches the `banned` and `throttled` paths at no cost to
 * the sender, so those two record at most once per address per minute while every successful
 * and every credential-failing attempt is still recorded one by one.
 *
 * Nothing written here goes to the general application log. A QueryException quotes its own
 * bound values, and those values are an address and a user-agent string — which is precisely
 * why the failure is reported without the exception.
 */
final class LoginEventRecorder
{
    /** How long one address may record the cheap-to-trigger outcomes more than once. */
    private const int GATE_SECONDS = 60;

    /** `username_attempted` is a copy of what was typed, not a copy of a column. */
    private const int USERNAME_LIMIT = 191;

    /** `user_agent` is stored for reading, so the longest thing worth reading is kept. */
    private const int USER_AGENT_LIMIT = 1000;

    public function __construct(private readonly CacheRepository $cache) {}

    /**
     * The reason a failed attempt failed, read off what the caller already knew: whether an
     * account was found, and whether it was the second factor or the password that was refused.
     */
    public static function failureReason(Request $request, ?User $user): string
    {
        $isCheckpoint = $request->route()?->named('auth.login-checkpoint') ?? false;

        return match (true) {
            $isCheckpoint && $user === null => 'checkpoint_not_found',
            $isCheckpoint => 'second_factor_invalid',
            $user === null => 'account_not_found',
            default => 'credentials_invalid',
        };
    }

    public function success(Request $request, User $user): void
    {
        $this->write($request, LoginEventOutcome::Success, $user);
    }

    /**
     * The password verified and the account uses two-factor authentication. This is not a
     * failure and not yet a sign-in, and an administrator needs to be able to tell the two
     * apart: a checkpoint that never completes is a stolen password being handed to someone
     * who cannot get past their own second factor.
     */
    public function checkpoint(Request $request, User $user): void
    {
        $this->write($request, LoginEventOutcome::Checkpoint, $user, 'second_factor_required');
    }

    /**
     * A refusal on the first factor. `$reason` says which kind, worked out by the caller from
     * what it already knew rather than guessed at here.
     */
    public function failed(Request $request, ?User $user, string $reason): void
    {
        $this->write($request, LoginEventOutcome::Failed, $user, $reason);
    }

    /**
     * A refusal by the address ban list, which never reached an account at all. The ban id is
     * kept so the row names the rule that applied even after an administrator lifts it and the
     * ban row is gone.
     */
    public function banned(Request $request, ?int $banId): void
    {
        if (! $this->gateAllows($request, LoginEventOutcome::Banned)) {
            return;
        }

        $this->write($request, LoginEventOutcome::Banned, null, 'address_banned', $banId);
    }

    /**
     * The rate limiter refused before the credentials were looked at.
     */
    public function throttled(Request $request): void
    {
        if (! $this->gateAllows($request, LoginEventOutcome::Throttled)) {
            return;
        }

        $this->write($request, LoginEventOutcome::Throttled, null, 'too_many_attempts');
    }

    /**
     * The password was right and the account is closed, so no session was made. The reference
     * is kept on the row because it is what the account is told to quote: an administrator
     * matching a support conversation to an attempt has only the six characters.
     *
     * This one is not gated the way the address-level refusals are. Writing it takes the
     * account's password, and an administrator looking at a suspended account wants every time
     * it knocked.
     */
    public function suspended(Request $request, User $user, ?string $caseId): void
    {
        $this->write($request, LoginEventOutcome::Suspended, $user, 'account_suspended', null, $caseId);
    }

    private function write(
        Request $request,
        LoginEventOutcome $outcome,
        ?User $user,
        ?string $reason = null,
        ?int $banId = null,
        ?string $caseId = null,
    ): void {
        $address = ClientIpResolver::resolve($request);
        $agent = $request->userAgent();

        try {
            LoginEvent::query()->create([
                'user_id' => $user?->id,
                'user_uuid' => $user?->uuid,
                'username_attempted' => $this->attempted($request, $user),
                'ip_address' => $address?->bytes,
                'outcome' => $outcome->value,
                'reason_code' => $reason,
                'ip_ban_id' => $banId,
                'suspension_case_id' => $caseId,
                'user_agent' => $agent === null ? null : mb_substr($agent, 0, self::USER_AGENT_LIMIT),
                'fingerprint' => ClientFingerprint::fromRequest($request),
            ]);
        } catch (QueryException) {
            logger()->warning('Could not record a sign-in attempt in login_events.');
        }
    }

    /**
     * One row per address per minute for the outcomes an unauthenticated client can trigger at
     * no cost. A gate that says "recorded recently" is a fact about this address, so an address
     * cannot use another address — or another account — to write past it.
     */
    private function gateAllows(Request $request, LoginEventOutcome $outcome): bool
    {
        $address = ClientIpResolver::resolve($request);
        // The label of the normalised address, so one host written in another notation is
        // still the same gate and cannot be used to record the same refusal twice.
        $subject = $address === null ? 'unattributed' : $address->label();
        $key = sprintf('security:login-events:%s:%s', $outcome->value, $subject);

        return $this->cache->add($key, 1, self::GATE_SECONDS);
    }

    /**
     * What was typed as the account name. The login endpoints take it as `user`; the checkpoint
     * endpoint takes a token instead, and there the account is the one the checkpoint names.
     */
    private function attempted(Request $request, ?User $user): ?string
    {
        $typed = trim($request->string('user')->toString());
        $attempted = $typed !== '' ? $typed : $user?->username;

        return $attempted === null ? null : mb_substr($attempted, 0, self::USERNAME_LIMIT);
    }
}
