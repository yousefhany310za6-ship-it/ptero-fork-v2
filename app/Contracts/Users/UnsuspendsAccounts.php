<?php

declare(strict_types=1);

namespace Pterodactyl\Contracts\Users;

use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Throwable;

interface UnsuspendsAccounts
{
    /**
     * Lift a suspension: the account may sign in again, and the servers this suspension
     * stopped are released. Nothing here powers a server on — see the note in the action.
     *
     * A null actor is a lift nobody performed: the expiry command closes a temporary
     * suspension whose moment has passed, and `lifted_by` staying null is the honest record
     * of that rather than the name of whoever is signed in reading the queue.
     *
     * @throws Throwable
     */
    public function unsuspend(UserSuspension $suspension, ?User $actor = null): UserSuspension;
}
