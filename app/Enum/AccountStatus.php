<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

/**
 * Whether an account may use the panel right now. Held on `users.account_status` because
 * it is read on every authenticated request, and written only by the suspend and
 * unsuspend actions — never by a mass-assignable request, which is what stops an account
 * from lifting its own suspension through the profile endpoint.
 */
enum AccountStatus: string
{
    /** The default, and the state every account that exists today was left in. */
    case Active = 'active';

    /** Sign-in, live sessions, API tokens and every server operation are refused. */
    case Suspended = 'suspended';
}
