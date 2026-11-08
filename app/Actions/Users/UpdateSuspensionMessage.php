<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Users;

use Illuminate\Validation\ValidationException;
use Pterodactyl\Contracts\Users\EditsSuspensionMessage;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;

/**
 * Corrects what a suspended account is told.
 *
 * This appends a version and never touches the row already there. The requirement is to be
 * able to fix the wording without changing the original record, and an UPDATE would change
 * it: the account holder would lose the text they were actually shown, and nobody reading the
 * case later could tell that the message was corrected rather than never worded that way.
 */
final readonly class UpdateSuspensionMessage implements EditsSuspensionMessage
{
    /** Kept in step with the request rule, because the expiry command reaches this without one. */
    public const int MAX_LENGTH = 5000;

    public function edit(UserSuspension $suspension, string $message, User $actor): UserSuspensionMessage
    {
        $message = trim($message);

        if ($message === '') {
            throw ValidationException::withMessages([
                'message' => 'The message shown to the account cannot be blank.',
            ]);
        }

        if (mb_strlen($message) > self::MAX_LENGTH) {
            throw ValidationException::withMessages([
                'message' => 'The message shown to the account must be under '.self::MAX_LENGTH.' characters.',
            ]);
        }

        if ($suspension->isLifted()) {
            throw ValidationException::withMessages([
                'suspension' => 'This suspension is lifted, so there is no message in force to correct.',
            ]);
        }

        $version = $suspension->messages()->create([
            'message' => $message,
            'created_by' => $actor->id,
        ]);

        Activity::event('admin:user.update-message')
            ->subject($suspension->user, $suspension)
            ->withRequestMetadata()
            ->property([
                'support_case_id' => $suspension->support_case_id,
                'version' => $suspension->messages()->count(),
            ])
            ->log();

        return $version;
    }
}
