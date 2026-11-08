<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Users;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Contracts\Users\SuspendsAccounts;
use Pterodactyl\Enum\AccountStatus;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Jobs\Users\ToggleUserServerSuspension;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;
use Pterodactyl\Support\SupportCaseId;
use RuntimeException;

/**
 * Suspends an account and records the decision.
 *
 * Two things happen and only in this order: the account is closed and its suspension is
 * written down, in one transaction; then its servers are queued to be suspended, outside
 * it. Nothing on the account side waits for a node to answer, and nothing is claimed about
 * the servers before the daemon has agreed to it — the per-server rows the jobs write are
 * the record of what actually happened.
 */
final readonly class SuspendUser implements SuspendsAccounts
{
    /** How many candidate references one suspension is willing to look for before giving up. */
    private const int CASE_ID_ATTEMPTS = 8;

    public function suspend(
        User $target,
        User $actor,
        SuspensionReason $reason,
        string $publicMessage,
        ?string $adminNote = null,
        ?CarbonImmutable $expiresAt = null,
        bool $acknowledgeLockout = false,
    ): UserSuspension {
        $this->assertSuspensible($target, $actor, $adminNote, $acknowledgeLockout);

        $caseId = $this->uniqueCaseId();
        $now = CarbonImmutable::now();

        $suspension = DB::transaction(function () use (
            $target,
            $actor,
            $caseId,
            $reason,
            $publicMessage,
            $adminNote,
            $expiresAt,
        ): UserSuspension {
            // Guarded on the state being left: two administrators suspending the same
            // account at the same moment converge on one record instead of writing two,
            // and the loser of the race is told rather than silently joining the queue.
            $closed = User::query()
                ->whereKey($target->id)
                ->where('account_status', AccountStatus::Active->value)
                ->update([
                    'account_status' => AccountStatus::Suspended->value,
                    // A "remember me" cookie on a shared browser is not a session an
                    // administrator just closed; it cannot be allowed to reopen one later.
                    'remember_token' => null,
                ]);

            if ($closed !== 1) {
                throw ValidationException::withMessages([
                    'user' => 'This account has already been suspended by someone else.',
                ]);
            }

            $suspension = UserSuspension::query()->create([
                'user_id' => $target->id,
                'support_case_id' => $caseId,
                'reason' => $reason,
                'internal_note' => $adminNote,
                'expires_at' => $expiresAt,
                'created_by' => $actor->id,
            ]);

            UserSuspensionMessage::query()->create([
                'suspension_id' => $suspension->id,
                'message' => $publicMessage,
                'created_by' => $actor->id,
            ]);

            return $suspension;
        });

        $target->refresh();

        $this->queueServers($target, $suspension);

        Activity::event('admin:user.suspend')
            ->subject($target, $suspension)
            ->withRequestMetadata()
            ->property([
                'support_case_id' => $suspension->support_case_id,
                'reason' => $reason->value,
                'expires_at' => $expiresAt?->toIso8601String(),
            ])
            ->log();

        return $suspension->load('messages');
    }

    /**
     * The decisions this action refuses to make on an administrator's behalf.
     */
    private function assertSuspensible(User $target, User $actor, ?string $adminNote, bool $acknowledgeLockout): void
    {
        if ($target->isSuspended()) {
            throw ValidationException::withMessages([
                'user' => 'This account is already suspended; lift it before suspending it again.',
            ]);
        }

        if ($target->id === $actor->id) {
            throw ValidationException::withMessages([
                'user' => 'You cannot suspend the account you are signed in with.',
            ]);
        }

        // Suspending a fellow administrator is the one case where a decision has to be
        // written down in private as well as in public: whoever reads the record later is
        // likely to be the person who disagrees with it.
        if ($target->root_admin && trim((string) $adminNote) === '') {
            throw ValidationException::withMessages([
                'internal_note' => 'Suspending an administrator requires an internal note explaining it.',
            ]);
        }

        if ($acknowledgeLockout) {
            return;
        }

        $others = User::query()
            ->where('root_admin', true)
            ->where('account_status', AccountStatus::Active->value)
            ->whereKeyNot($target->id)
            ->exists();

        if (! $others && $target->root_admin) {
            throw ValidationException::withMessages([
                'acknowledge_lockout' => 'This is the only active administrator. Suspending it leaves nobody who can lift it.',
            ]);
        }
    }

    /**
     * A reference nobody else answers to. The unique index is what makes that true even when
     * two suspensions are opened in the same instant; the loop only exists so the common case
     * is a clean insert rather than a collision.
     */
    private function uniqueCaseId(): string
    {
        for ($attempt = 0; $attempt < self::CASE_ID_ATTEMPTS; $attempt++) {
            $candidate = SupportCaseId::generate();

            if (! UserSuspension::query()->where('support_case_id', $candidate)->exists()) {
                return $candidate;
            }
        }

        // A nine-digit space colliding eight times in a row is a broken generator, not bad
        // luck, and saying so is better than writing a reference that may already be spoken
        // for.
        throw new RuntimeException('Could not generate a unique support case id.');
    }

    /**
     * One job per owned server, dispatched after the account is already closed.
     */
    private function queueServers(User $target, UserSuspension $suspension): void
    {
        // Owned servers only. A server the account merely has a subuser seat on belongs to
        // somebody else, and suspending it would let one account close another's.
        foreach ($target->servers()->cursor() as $server) {
            ToggleUserServerSuspension::dispatch(
                $suspension,
                $server,
                TogglesServerSuspension::ACTION_SUSPEND
            );
        }
    }
}
