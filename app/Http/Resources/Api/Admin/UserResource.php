<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Resources\Api\Admin;

use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Http\Resources\Api\Includes\IncludedResource;
use Pterodactyl\Models\User;
use Pterodactyl\Support\Network\IpAddressNormalizer;

/**
 * @extends AdminResource<User>
 */
class UserResource extends AdminResource
{
    protected array $includeRelations = [
        'servers' => ['relation' => 'servers', 'resource' => ServerResource::class],
    ];

    protected array $availableIncludes = ['servers'];

    public function resourceName(): string
    {
        return User::RESOURCE_NAME;
    }

    public function toArray(Request $request): array
    {
        $user = $this->resource;

        return [
            'id' => $user->id,
            'external_id' => $user->external_id,
            'uuid' => $user->uuid,
            'username' => $user->username,
            'email' => $user->email,
            'first_name' => $user->name_first,
            'last_name' => $user->name_last,
            'language' => $user->language,
            'root_admin' => (bool) $user->root_admin,
            '2fa' => (bool) $user->use_totp,
            'image' => 'https://gravatar.com/avatar/'.md5(Str::lower($user->email)),
            'servers_count' => (int) ($user->servers_count ?? 0),
            'subuser_of_count' => (int) ($user->subuser_of_count ?? 0),
            // An account's status and its reference are what an administrator is looking for on
            // this screen; the reasoning behind a closure stays on the suspension endpoints,
            // which only root can reach.
            'account_status' => $user->account_status->value,
            'support_case_id' => $user->activeSuspension?->support_case_id,
            'last_login_at' => $this->timestampOf($user->last_login_at),
            // The address an account last signed in from is read out of sign-in history, and it is
            // the one field here that is masked rather than given: the admin API is root-only
            // today, so this check is not what keeps the address from a narrower role — it is what
            // keeps that true if this resource is ever reached by one. An account signs in from an
            // address; that belongs to the account, not to whoever is allowed to list it.
            'last_ip' => $request->user()?->root_admin === true ? $this->addressOf($user->last_ip) : null,
            'created_at' => $this->formatTimestamp($user->created_at),
            'updated_at' => $this->formatTimestamp($user->updated_at),
            'relationships' => [],
            ...$this->extensionFields($user),
        ];
    }

    protected function resolveInclude(string $include): ?IncludedResource
    {
        return match ($include) {
            'servers' => $this->includeServers(),
            default => parent::resolveInclude($include),
        };
    }

    private function includeServers(): ApiResourceCollection
    {
        return $this->items($this->resource->loadMissing('servers')->servers, ServerResource::class, 'server');
    }

    /**
     * The bytes of a sign-in row, as the text an administrator would type into a ban. These come
     * off a subquery rather than a column, so the value arrives as whatever the database made of
     * it. Null is the honest answer for an account that has never signed in, and for a row that
     * carried no attributable address — which looks the same everywhere else.
     */
    private function addressOf(mixed $stored): ?string
    {
        if (! is_string($stored) || $stored === '') {
            return null;
        }

        $bytes = hex2bin($stored);

        return IpAddressNormalizer::fromStorage($bytes === false ? null : $bytes)?->label();
    }

    /**
     * A timestamp read off a subquery rather than a column, so the value is whatever the database
     * made of it, and an account that has never signed in has no such value at all.
     */
    private function timestampOf(mixed $stored): ?string
    {
        return $stored instanceof CarbonInterface || is_string($stored) ? $this->formatTimestamp($stored) : null;
    }
}
