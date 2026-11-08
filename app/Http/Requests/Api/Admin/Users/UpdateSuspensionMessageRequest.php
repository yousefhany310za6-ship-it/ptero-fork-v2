<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class UpdateSuspensionMessageRequest extends AdminApiRequest
{
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
            // Same bounds as the message issued with the suspension: a correction is the
            // same kind of text, and nothing about editing it should be looser.
            'message' => ['required', 'string', 'between:10,5000'],
        ];
    }
}
