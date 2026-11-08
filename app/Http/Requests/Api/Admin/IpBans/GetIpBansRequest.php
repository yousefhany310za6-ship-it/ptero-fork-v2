<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\IpBans;

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class GetIpBansRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [];
    }
}
