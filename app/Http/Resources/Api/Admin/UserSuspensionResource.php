<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;

/**
 * @extends AdminResource<UserSuspension>
 *
 * Reachable only through root administrator routes (see the requests in
 * Http\Requests\Api\Admin\Users). `internal_note` lives here because an administrator
 * reviewing a decision needs the reasoning behind it; the page a suspended account sees is
 * built by a different resource and never reads this one.
 */
class UserSuspensionResource extends AdminResource
{
    public function resourceName(): string
    {
        return UserSuspension::RESOURCE_NAME;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $suspension = $this->resource;

        return [
            'id' => $suspension->id,
            'user_id' => $suspension->user_id,
            'support_case_id' => $suspension->support_case_id,
            'reason' => $suspension->reason->value,
            'status' => $this->status($suspension),
            // What the account holder is told now: the newest version. The older versions are
            // not listed here on purpose — a correction is read as a correction, not as a
            // second message the account was sent.
            'message' => $suspension->messages->last()?->message,
            'internal_note' => $suspension->internal_note,
            'is_permanent' => $suspension->isPermanent(),
            'expires_at' => $suspension->expires_at?->toIso8601String(),
            'created_by' => $suspension->created_by,
            'lifted_by' => $suspension->lifted_by,
            'lifted_at' => $suspension->lifted_at?->toIso8601String(),
            'created_at' => $this->formatTimestamp($suspension->created_at),
            'updated_at' => $this->formatTimestamp($suspension->updated_at),
            'servers' => $suspension->servers
                ->map(fn (UserSuspensionServer $server): array => [
                    'server_id' => $server->server_id,
                    'server_uuid' => $server->server_uuid,
                    'outcome' => $server->outcome->value,
                    'wings_state_before' => $server->wings_state_before,
                    'failure' => $server->failure,
                ])
                ->all(),
        ];
    }

    /**
     * The same three states `filter[status]` selects, so a list cannot describe a row one way
     * and the row itself another.
     */
    private function status(UserSuspension $suspension): string
    {
        if ($suspension->isLifted()) {
            return 'lifted';
        }

        return $suspension->isAwaitingExpiryLift() ? 'expired' : 'active';
    }
}
