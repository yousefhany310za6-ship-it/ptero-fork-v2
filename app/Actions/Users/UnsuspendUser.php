<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Users;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Contracts\Users\UnsuspendsAccounts;
use Pterodactyl\Enum\AccountStatus;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Jobs\Users\ToggleUserServerSuspension;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;

/**
 * Lifts a suspension: the account is allowed back in and its servers are released.
 *
 * The account is reopened and the record is closed in one transaction, and the servers are
 * queued afterwards — the mirror image of the suspension, for the same reason: a node that
 * does not answer must not be able to hold an account closed.
 *
 * No server is powered on here, by any path. Releasing a suspension means removing the block
 * that made the daemon refuse to act on a container, not deciding that it should run. A
 * server the account holder had stopped themselves stays stopped.
 */
final readonly class UnsuspendUser implements UnsuspendsAccounts
{
    /**
     * Outcomes meaning this suspension stopped, or tried to stop, a server. Anything else is
     * left alone: `already_suspended` is somebody else's decision, and `cancelled` means this
     * suspension never touched the container.
     */
    private const array RELEASE_OUTCOMES = [
        ServerSuspensionOutcome::Suspended->value,
        ServerSuspensionOutcome::Deferred->value,
        ServerSuspensionOutcome::Failed->value,
    ];

    public function unsuspend(UserSuspension $suspension, ?User $actor = null): UserSuspension
    {
        $this->assertLiftable($suspension);

        $now = CarbonImmutable::now();

        $lifted = DB::transaction(function () use ($suspension, $actor, $now): UserSuspension {
            // The suspension row is the lock, not the account: two administrators lifting the
            // same suspension converge here, and the loser is told instead of writing a second
            // lift over the first.
            $closed = UserSuspension::query()
                ->whereKey($suspension->id)
                ->whereNull('lifted_at')
                ->update(['lifted_at' => $now, 'lifted_by' => $actor?->id]);

            if ($closed !== 1) {
                throw ValidationException::withMessages([
                    'suspension' => 'This suspension has already been lifted by someone else.',
                ]);
            }

            $this->reopen($suspension);

            return $suspension->refresh();
        });

        $this->queueServers($lifted);

        $event = Activity::event('admin:user.unsuspend')
            ->subject($lifted->user, $lifted)
            ->property([
                'support_case_id' => $lifted->support_case_id,
                'servers_released' => $lifted->servers()
                    ->whereIn('outcome', self::RELEASE_OUTCOMES)
                    ->count(),
            ]);

        // A lift on the clock has no administrator standing behind it, and pretending
        // otherwise would put words in the mouth of whoever happens to be signed in.
        if ($actor !== null) {
            $event = $event->withRequestMetadata();
        }

        $event->log();

        return $lifted->load(['messages', 'servers']);
    }

    private function assertLiftable(UserSuspension $suspension): void
    {
        $liftedAt = $suspension->lifted_at;

        if ($liftedAt === null) {
            return;
        }

        throw ValidationException::withMessages([
            'suspension' => 'This suspension was already lifted on '.$liftedAt->toDateString().'.',
        ]);
    }

    /**
     * Reopen the account, unless another unlifted suspension still stands over it.
     *
     * `users.account_status` is the one thing the request paths read, so it has to be honest
     * in both directions: it cannot be left closed once the last suspension is gone, and it
     * cannot be opened while one is still unlifted.
     */
    private function reopen(UserSuspension $suspension): void
    {
        $blocking = UserSuspension::query()
            ->where('user_id', $suspension->user_id)
            ->whereKeyNot($suspension->id)
            ->active()
            ->exists();

        if ($blocking) {
            return;
        }

        User::query()
            ->whereKey($suspension->user_id)
            ->where('account_status', AccountStatus::Suspended->value)
            ->update(['account_status' => AccountStatus::Active->value]);
    }

    /**
     * Release the servers this suspension is responsible for — and no others.
     */
    private function queueServers(UserSuspension $suspension): void
    {
        $records = UserSuspensionServer::query()
            ->where('suspension_id', $suspension->id)
            ->whereIn('outcome', self::RELEASE_OUTCOMES)
            ->with('server')
            ->get();

        foreach ($records as $record) {
            // A server deleted between the suspension and the lift is gone; its row stays as
            // the record of what happened to it while it existed.
            if ($record->server === null) {
                continue;
            }

            ToggleUserServerSuspension::dispatch(
                $suspension,
                $record->server,
                TogglesServerSuspension::ACTION_UNSUSPEND
            );
        }
    }
}
