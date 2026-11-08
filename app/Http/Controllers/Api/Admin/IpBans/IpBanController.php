<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\IpBans;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Enum\IpBanDuration;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\IpBans\DeleteIpBanRequest;
use Pterodactyl\Http\Requests\Api\Admin\IpBans\GetIpBansRequest;
use Pterodactyl\Http\Requests\Api\Admin\IpBans\StoreIpBanRequest;
use Pterodactyl\Http\Resources\Api\Admin\IpBanResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Services\Security\IpBanService;
use Pterodactyl\Support\Network\IpAddressNormalizer;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('IP Bans', 'Network addresses refused access to the panel, independent of any account.')]
class IpBanController extends AdminApiController
{
    /**
     * List bans.
     */
    #[Endpoint('List IP bans', 'Returns a paginated list of banned addresses and ranges.')]
    #[QueryParam('filter[ip]', 'string', 'Find the ban that covers this address, in any notation.', required: false, example: '203.0.113.7')]
    #[QueryParam('filter[status]', 'string', 'active|expired|permanent', required: false, example: 'active')]
    #[QueryParam('filter[reason]', 'string', 'Partial match against the reason an administrator wrote.', required: false)]
    #[QueryParam('sort', 'string', 'Sort by id, expires_at, created_at, or updated_at. Prefix with a hyphen for descending.', required: false, example: '-created_at')]
    public function index(GetIpBansRequest $request): ApiResourceCollection
    {
        $bans = QueryBuilder::for(IpBan::query())
            ->allowedFilters([
                AllowedFilter::callback('ip', function (Builder $query, string $value): void {
                    $this->filterCovering($query, $value);
                }),
                AllowedFilter::scope('status'),
                AllowedFilter::partial('reason'),
            ])
            ->allowedSorts(['id', 'expires_at', 'created_at', 'updated_at'])
            ->defaultSort('-created_at')
            ->paginate($request->perPage());

        return IpBanResource::collection($bans);
    }

    /**
     * Ban an address or range.
     */
    #[Endpoint('Ban IP address', 'Refuses sign-in from a single address or a CIDR range, for every account that uses it.')]
    public function store(StoreIpBanRequest $request, IpBanService $bans): JsonResponse
    {
        $validated = $request->validated();
        /** @var string $ip */
        $ip = $validated['ip'];
        /** @var string $reason */
        $reason = $validated['reason'];

        /** @var string $duration */
        $duration = $validated['duration'];
        /** @var string|null $expiresAtInput */
        $expiresAtInput = $validated['expires_at'] ?? null;

        // A permanent ban is the absence of an end date, so nothing has to be kept in step
        // between two columns.
        $expiresAt = IpBanDuration::from($duration)->requiresExpiry()
            ? CarbonImmutable::parse($expiresAtInput)
            : null;

        $ban = $bans->ban(
            $ip,
            $reason,
            $expiresAt,
            $request->user(),
            filter_var($validated['acknowledge_broad'] ?? false, FILTER_VALIDATE_BOOLEAN),
        );

        Activity::event('admin:ip-ban.create')
            ->subject($ban)
            ->property('ip', $ban->rangeLabel())
            ->property('permanent', $ban->isPermanent())
            ->log();

        return IpBanResource::make($ban)->respond(Response::HTTP_CREATED);
    }

    /**
     * Lift a ban.
     */
    #[Endpoint('Lift IP ban', 'Removes the ban; sign-in from the address is permitted again immediately.')]
    public function destroy(DeleteIpBanRequest $request, IpBan $ban, IpBanService $bans): Response
    {
        $label = $ban->rangeLabel();

        Activity::event('admin:ip-ban.delete')
            ->subject($ban)
            ->property('ip', $label)
            ->log();

        $bans->lift($ban);

        return $this->returnNoContent();
    }

    /**
     * Which stored range covers a given address — the question an administrator asks when a
     * user reports being unable to sign in. Comparing the normalised bytes against the
     * bounds is what makes any spelling of the address find the same row.
     *
     * @param  Builder<IpBan>  $query
     */
    private function filterCovering(Builder $query, string $value): void
    {
        $address = IpAddressNormalizer::parse($value);

        if ($address === null) {
            throw ValidationException::withMessages(['filter.ip' => 'The ip filter must be a single address, not a range.']);
        }

        $query->where('first_ip', '<=', $address->bytes)->where('last_ip', '>=', $address->bytes);
    }
}
