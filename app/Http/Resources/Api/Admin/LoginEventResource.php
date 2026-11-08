<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\LoginEvent;

/**
 * @extends AdminResource<LoginEvent>
 */
class LoginEventResource extends AdminResource
{
    public function resourceName(): string
    {
        return LoginEvent::RESOURCE_NAME;
    }

    /**
     * The stored byte form is never exposed; the address comes back as the text an
     * administrator would recognise, which is the same text a ban is written in.
     *
     * `user_id` and `user_uuid` are included because the question this table answers is
     * "who else signed in from here" — a row that could not name its account would not
     * answer it. Nothing here exposes an email address or a password, ever.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $event = $this->resource;

        return [
            'id' => $event->id,
            'user_id' => $event->user_id,
            'user_uuid' => $event->user_uuid,
            'username_attempted' => $event->username_attempted,
            'ip' => $event->address()?->label(),
            'outcome' => $event->outcome->value,
            'reason' => $event->reason_code,
            'ip_ban_id' => $event->ip_ban_id,
            'suspension_case_id' => $event->suspension_case_id,
            'user_agent' => $event->user_agent,
            'fingerprint' => $event->fingerprint,
            'created_at' => $this->formatTimestamp($event->created_at),
        ];
    }
}
