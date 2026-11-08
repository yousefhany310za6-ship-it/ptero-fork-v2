<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\LoginEvents;

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

/**
 * Sign-in history names addresses, account names, and the browsers that used them. That is
 * the panel's evidence about who did what from where, so it is read by root administrators
 * only — an empty permission list is what makes the subuser-role administrators walk past it.
 */
class GetLoginEventsRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [];
    }
}
