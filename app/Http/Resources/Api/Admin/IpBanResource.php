<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\IpBan;

/**
 * @extends AdminResource<IpBan>
 */
class IpBanResource extends AdminResource
{
    public function resourceName(): string
    {
        return IpBan::RESOURCE_NAME;
    }

    /**
     * The stored byte bounds are never exposed; only the text an administrator would
     * recognise is. Nothing here names a user, because a ban is on an address.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $ban = $this->resource;

        return [
            'id' => $ban->id,
            'ip' => $ban->rangeLabel(),
            'is_range' => $ban->isRange(),
            'reason' => $ban->reason,
            'is_permanent' => $ban->isPermanent(),
            'expires_at' => $ban->expires_at?->toIso8601String(),
            'created_by' => $ban->created_by,
            'created_at' => $this->formatTimestamp($ban->created_at),
            'updated_at' => $this->formatTimestamp($ban->updated_at),
        ];
    }
}
