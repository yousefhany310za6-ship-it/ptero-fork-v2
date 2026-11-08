<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class DeleteUserSuspensionRequest extends AdminApiRequest
{
    /**
     * Lifting a suspension reopens an account that was closed on purpose, so it is held to
     * the same bar as closing one.
     */
    public function permissions(): array
    {
        return [];
    }
}
