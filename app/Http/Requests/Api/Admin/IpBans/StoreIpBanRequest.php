<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\IpBans;

use Illuminate\Validation\Rule;
use Pterodactyl\Enum\IpBanDuration;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

class StoreIpBanRequest extends AdminApiRequest
{
    /**
     * Banning a network address reaches every account that signs in from it, including
     * the administrator's own. That is why this is limited to root rather than to a
     * sub-permission an administrator could be granted by mistake.
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
            // Parsed into range bounds by the service, which reports what it cannot read.
            'ip' => ['required', 'string', 'max:96'],
            'reason' => ['required', 'string', 'between:3,500'],
            'duration' => ['required', Rule::enum(IpBanDuration::class)],
            'expires_at' => ['nullable', 'date', 'after:now', 'required_if:duration,'.IpBanDuration::Temporary->value],
            'acknowledge_broad' => ['nullable', 'boolean'],
        ];
    }
}
