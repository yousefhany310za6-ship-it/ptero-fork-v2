<?php

declare(strict_types=1);

namespace Pterodactyl\Contracts\Users;

use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;
use Throwable;

interface EditsSuspensionMessage
{
    /**
     * Correct what a suspended account is told. This appends a version: the message that
     * was first issued stays in the table exactly as it was written, which is the only way
     * "editing the message without changing the original record" can be true.
     *
     * @throws Throwable
     */
    public function edit(UserSuspension $suspension, string $message, User $actor): UserSuspensionMessage;
}
