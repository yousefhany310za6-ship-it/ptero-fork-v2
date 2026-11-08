<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\LoginEvents;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\LoginEvents\GetLoginEventsRequest;
use Pterodactyl\Http\Resources\Api\Admin\LoginEventResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Support\Network\IpAddressNormalizer;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;
use stdClass;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Sign-in History', 'Addresses that attempted to authenticate, successful or not.')]
class LoginEventController extends AdminApiController
{
    /** How many accounts one address lookup will name before it says it stopped counting. */
    private const int MAX_ACCOUNTS = 50;

    private const array ASSOCIATED_EXAMPLE = [
        'data' => [
            'ip' => '203.0.113.7',
            'accounts' => [
                [
                    'user_uuid' => '9a8b7c6d-5e4f-4321-9876-123456789abc',
                    'username_attempted' => 'admin',
                    'attempts' => 4,
                    'successes' => 3,
                    'last_seen' => '2026-11-06T12:00:00+00:00',
                ],
                [
                    'user_uuid' => null,
                    'username_attempted' => 'root',
                    'attempts' => 1,
                    'successes' => 0,
                    'last_seen' => '2026-11-06T11:58:00+00:00',
                ],
            ],
            'truncated' => false,
        ],
    ];

    /**
     * List sign-in attempts.
     */
    #[Endpoint('List sign-in history', 'Returns a paginated list of authentication attempts, newest first.')]
    #[QueryParam('filter[ip]', 'string', 'Attempts from this exact address, in any notation.', required: false, example: '203.0.113.7')]
    #[QueryParam('filter[outcome]', 'string', 'success|failed|banned|suspended|throttled|checkpoint', required: false, example: 'failed')]
    #[QueryParam('sort', 'string', 'Sort by id or created_at. Prefix with a hyphen for descending.', required: false, example: '-id')]
    public function index(GetLoginEventsRequest $request): ApiResourceCollection
    {
        $events = QueryBuilder::for(LoginEvent::query())
            ->allowedFilters([
                AllowedFilter::callback('ip', function (Builder $query, string $value): void {
                    $this->filterAddress($query, $value);
                }),
                AllowedFilter::scope('outcome'),
            ])
            ->allowedSorts(['id', 'created_at'])
            ->defaultSort('-id')
            ->paginate($request->perPage());

        return LoginEventResource::collection($events);
    }

    /**
     * One account's address history.
     */
    #[Endpoint('List account sign-in history', 'Returns the addresses an account authenticated from, newest first, with the failed attempts kept separate from the successful ones.')]
    #[QueryParam('filter[ip]', 'string', 'Narrow this account\'s history to one address, in any notation.', required: false, example: '203.0.113.7')]
    #[QueryParam('filter[outcome]', 'string', 'success|failed|banned|suspended|throttled|checkpoint', required: false, example: 'success')]
    #[QueryParam('sort', 'string', 'Sort by id or created_at. Prefix with a hyphen for descending.', required: false, example: '-id')]
    public function ipHistory(GetLoginEventsRequest $request, User $user): ApiResourceCollection
    {
        // Keyed on the account row, not on the name that was typed: an attempt that used this
        // account's username and failed on the password is not this account signing in from a
        // new address, and listing it as one would turn other people's guesses into this
        // account's history.
        $events = QueryBuilder::for(LoginEvent::query()->where('user_id', $user->id))
            ->allowedFilters([
                AllowedFilter::callback('ip', function (Builder $query, string $value): void {
                    $this->filterAddress($query, $value);
                }),
                AllowedFilter::scope('outcome'),
            ])
            ->allowedSorts(['id', 'created_at'])
            ->defaultSort('-id')
            ->paginate($request->perPage());

        return LoginEventResource::collection($events);
    }

    /**
     * Every account that has signed in from one address, and the names it was tried under.
     *
     * This is the question an administrator asks next: an address is only worth what it
     * connects. The answer is grouped in the database rather than paged through in the
     * browser, so it stays one query whatever the volume, and it is capped, because one
     * address can be the source of an enumeration run of thousands of names.
     */
    #[Endpoint('List accounts using an address', 'Groups the sign-in history of one address by the account it was used for, newest active account first.')]
    #[QueryParam('ip', 'string', 'The address to look up, in any notation.', required: true, example: '203.0.113.7')]
    #[ScribeResponse(self::ASSOCIATED_EXAMPLE, description: 'Accounts seen at this address.')]
    public function associated(GetLoginEventsRequest $request): JsonResponse
    {
        /** @var string|null $value */
        $value = $request->query('ip');
        $address = IpAddressNormalizer::parse((string) $value);

        if ($address === null) {
            throw ValidationException::withMessages(['ip' => 'The ip query parameter must be a single address, not a range.']);
        }

        // The base query, not the model: these rows are groups, not accounts, and reading a
        // computed column as though it were a model attribute would pretend otherwise. The
        // address is matched on the same normalised bytes the history is stored in.
        $groups = LoginEvent::query()->toBase()
            ->selectRaw('user_uuid, username_attempted, COUNT(*) as attempts, SUM(outcome = ?) as successes, MAX(created_at) as last_seen', [LoginEventOutcome::Success->value])
            ->where('ip_address', $address->bytes)
            ->groupBy(['user_uuid', 'username_attempted'])
            ->orderByDesc('last_seen')
            ->limit(self::MAX_ACCOUNTS + 1)
            ->get();

        $truncated = $groups->count() > self::MAX_ACCOUNTS;

        $accounts = $groups->take(self::MAX_ACCOUNTS)->map(static function (stdClass $group): array {
            /** @var string|null $uuid */
            $uuid = $group->user_uuid;
            /** @var string|null $attempted */
            $attempted = $group->username_attempted;
            /** @var int|string $attempts */
            $attempts = $group->attempts;
            /** @var int|string $successes */
            $successes = $group->successes;
            /** @var string|null $lastSeen */
            $lastSeen = $group->last_seen;

            return [
                'user_uuid' => $uuid,
                'username_attempted' => $attempted,
                'attempts' => (int) $attempts,
                'successes' => (int) $successes,
                'last_seen' => $lastSeen === null ? null : CarbonImmutable::parse($lastSeen)->toIso8601String(),
            ];
        })->all();

        return new JsonResponse(['data' => [
            'ip' => $address->label(),
            'accounts' => $accounts,
            'truncated' => $truncated,
        ]]);
    }

    /**
     * Which attempts came from an address. The input is normalised before it is compared, so
     * the same host written in another notation returns the same rows, and the bytes that were
     * stored are the bytes being matched.
     *
     * @param  Builder<LoginEvent>  $query
     */
    private function filterAddress(Builder $query, string $value): void
    {
        $address = IpAddressNormalizer::parse($value);

        if ($address === null) {
            throw ValidationException::withMessages(['filter.ip' => 'The ip filter must be a single address, not a range.']);
        }

        $query->forAddress($address);
    }
}
