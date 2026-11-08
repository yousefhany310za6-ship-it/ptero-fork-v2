<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

/**
 * What happened on the authentication path. Every row of `login_events` answers one of
 * these, and the six are the whole vocabulary: nothing is recorded that does not fall into
 * one, so an administrator reading a history list is never looking at an unexplained value.
 */
enum LoginEventOutcome: string
{
    /** A session was established. */
    case Success = 'success';

    /** Credentials, a checkpoint token, or a second factor did not verify. */
    case Failed = 'failed';

    /** The address is banned, so the attempt was refused before it reached an account. */
    case Banned = 'banned';

    /** The account is suspended, so the attempt is refused even though the password was right. */
    case Suspended = 'suspended';

    /** Too many attempts for this key; the attempt was not examined at all. */
    case Throttled = 'throttled';

    /** The password verified and a second factor is still outstanding. */
    case Checkpoint = 'checkpoint';
}
