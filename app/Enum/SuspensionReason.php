<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

/**
 * Why an account was suspended, from a fixed list.
 *
 * The list is closed on purpose: a free-text category cannot be filtered, counted or
 * compared across suspensions, and the category is what an administrator searching
 * "everything I did for payment reasons" needs. What actually happened in words goes in
 * the user-facing message and the internal note, which are free text.
 */
enum SuspensionReason: string
{
    /** A term the account holder agreed to and broke. */
    case TermsOfServiceViolation = 'terms_of_service_violation';

    /** The service itself was misused — spam, resource abuse, or using it for something it is not for. */
    case AbuseOfService = 'abuse_of_service';

    /** Behaviour that looks like an attack or an account takeover attempt. */
    case SuspiciousActivity = 'suspicious_activity';

    /** An unpaid or disputed balance. */
    case PaymentIssues = 'payment_issues';

    /** A violation that put other accounts, nodes or the panel itself at risk. */
    case SecurityViolation = 'security_violation';

    /** None of the above; the message is the whole explanation. */
    case Other = 'other';
}
