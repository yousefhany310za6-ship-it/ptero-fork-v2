<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Illuminate\Validation\Rule;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class SuspendUserRequest extends AdminApiRequest
{
    /**
     * Closing an account and stopping every server it owns is not a permission that can be
     * granted by mistake: root only, whatever the requesting role otherwise carries.
     */
    public function permissions(): array
    {
        return [];
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', Rule::enum(SuspensionReason::class)],
            // The text the account holder is shown. Kept to a length that still reads as one
            // message rather than a document, and never allowed to be blank: an account that
            // is locked out with no explanation is a support request nobody can answer.
            'message' => ['required', 'string', 'between:10,5000'],
            'internal_note' => ['nullable', 'string', 'max:5000'],
            // Permanent is the absence of an end date, so nothing has to be kept in step
            // between a duration column and a timestamp.
            'expires_at' => ['nullable', 'date', 'after:now'],
            'acknowledge_lockout' => ['nullable', 'boolean'],
        ];
    }
}
