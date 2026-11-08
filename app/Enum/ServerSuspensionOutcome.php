<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

/**
 * What the panel actually managed to do to one server of a suspended account.
 *
 * This is recorded per server rather than summarised on the suspension because the
 * daemon can refuse, be offline, or be mid-transfer for one server and not the others.
 * A single flag claiming the account's servers are stopped would be a claim about a
 * system that has its own opinion.
 */
enum ServerSuspensionOutcome: string
{
    /** The server was active, and Wings accepted the new configuration that stops it. */
    case Suspended = 'suspended';

    /** The suspension stopped this server, and lifting it released the server again. */
    case Released = 'released';

    /** The server was already suspended before this account was, so nothing was changed. */
    case AlreadySuspended = 'already_suspended';

    /** The server is mid-transfer, so touching its state would race the transfer. */
    case Deferred = 'deferred';

    /**
     * The account's suspension was already lifted by the time this attempt ran, so the
     * server was left exactly as it was. Worth recording: it is the answer to "did this
     * account ever have its servers stopped?"
     */
    case Cancelled = 'cancelled';

    /** Wings refused or could not be reached; the panel left its own state alone. */
    case Failed = 'failed';
}
