<?php

declare(strict_types=1);

namespace Pterodactyl\Console\Commands\Maintenance;

use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Pterodactyl\Contracts\Users\UnsuspendsAccounts;
use Pterodactyl\Models\UserSuspension;
use Throwable;

/**
 * Ends the temporary suspensions whose moment has passed.
 *
 * This runs only while `pterodactyl.security.auto_lift_expired` is on, and the setting is off
 * by default: an account staying closed until somebody opens it is the safer failure, because
 * the alternative is a policy in which an expiry date is a promise made on every
 * administrator's behalf, including the ones who meant it as a review deadline.
 *
 * The lift is the same action an administrator performs, so nothing about it is a shortcut:
 * the servers this suspension stopped are released, and no server is powered on.
 */
#[Description('Lifts temporary suspensions that have expired, when automatic lifting is enabled.')]
#[Signature('p:maintenance:lift-expired-suspensions')]
class LiftExpiredSuspensionsCommand extends Command
{
    private const int PER_RUN = 50;

    public function handle(UnsuspendsAccounts $unsuspender): void
    {
        if (! config('pterodactyl.security.auto_lift_expired')) {
            $this->info('Automatic lifting is disabled; nothing to do.');

            return;
        }

        $expired = UserSuspension::query()
            ->active()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', CarbonImmutable::now())
            // Oldest first, and bounded: a suspension whose servers cannot be released is
            // retried on the next run rather than blocking the ones behind it.
            ->orderBy('expires_at')
            ->limit(self::PER_RUN)
            ->with('user')
            ->get();

        $lifted = 0;
        $failed = 0;

        foreach ($expired as $suspension) {
            try {
                // No actor: this lift belongs to the clock, and `lifted_by` staying null is
                // the record saying so.
                $unsuspender->unsuspend($suspension);
                $lifted++;
            } catch (Throwable) {
                $failed++;
            }
        }

        $this->info(sprintf('Lifted %d expired suspension(s), %d failed.', $lifted, $failed));
    }
}
