<?php

declare(strict_types=1);

namespace Pterodactyl\Contracts\Users;

use Carbon\CarbonImmutable;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Throwable;

interface SuspendsAccounts
{
    /**
     * Stop an account using the panel and record why.
     *
     * @throws Throwable
     */
    public function suspend(
        User $target,
        User $actor,
        SuspensionReason $reason,
        string $publicMessage,
        ?string $adminNote = null,
        ?CarbonImmutable $expiresAt = null,
        bool $acknowledgeLockout = false,
    ): UserSuspension;
}
