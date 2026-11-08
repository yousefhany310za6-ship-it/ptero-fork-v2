<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class GetSuspensionsRequest extends AdminApiRequest
{
    /**
     * A suspension record quotes what an administrator decided and why, so reading history —
     * including somebody else's — is held to the same bar as writing it.
     */
    public function permissions(): array
    {
        return [];
    }
}
