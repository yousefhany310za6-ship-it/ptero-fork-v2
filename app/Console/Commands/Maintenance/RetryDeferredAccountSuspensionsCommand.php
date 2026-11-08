<?php

declare(strict_types=1);

namespace Pterodactyl\Console\Commands\Maintenance;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Jobs\Users\ToggleUserServerSuspension;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;

/**
 * Re-queues the servers a suspension could not apply.
 *
 * A node that was offline, or a server mid-transfer, leaves a row saying so instead of a
 * suspension that quietly believes it stopped everything. This is the second attempt: only
 * unlifted suspensions, only the rows that were deferred or failed, and only a bounded number
 * per run, so a node that stays offline costs a handful of queued jobs rather than an
 * ever-growing backlog.
 */
#[Description('Re-queues servers whose account suspension was deferred or failed.')]
#[Signature('p:maintenance:retry-account-suspensions')]
class RetryDeferredAccountSuspensionsCommand extends Command
{
    /** Kept well inside the unique-job lock window so a run cannot starve the queue. */
    private const int PER_RUN = 100;

    public function handle(): void
    {
        $records = UserSuspensionServer::query()
            ->whereIn('outcome', [ServerSuspensionOutcome::Deferred->value, ServerSuspensionOutcome::Failed->value])
            // Unlifted suspensions only — the same scope the actions use, so a suspension
            // somebody has already lifted is never re-applied by this command.
            ->whereIn('suspension_id', UserSuspension::query()->active()->select('id'))
            // Oldest first: a node that has been unreachable since Tuesday should not lose to
            // a server that failed a minute ago.
            ->orderBy('updated_at')
            ->limit(self::PER_RUN)
            ->with(['suspension', 'server'])
            ->get();

        $queued = 0;

        foreach ($records as $record) {
            $server = $record->server;
            $suspension = $record->suspension;

            // A server deleted after the attempt keeps its row as history; there is nothing
            // left to suspend. A suspension deleted or lifted since the query is skipped for
            // the same reason — the job re-checks it too, so this is only about not queueing
            // work that is already known to be moot.
            if ($server === null || $suspension === null) {
                continue;
            }

            ToggleUserServerSuspension::dispatch(
                $suspension,
                $server,
                TogglesServerSuspension::ACTION_SUSPEND
            );

            $queued++;
        }

        $this->info(sprintf('Re-queued %d server suspension(s).', $queued));
    }
}
