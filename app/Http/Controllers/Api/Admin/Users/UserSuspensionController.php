<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Users;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Contracts\Users\EditsSuspensionMessage;
use Pterodactyl\Contracts\Users\SuspendsAccounts;
use Pterodactyl\Contracts\Users\UnsuspendsAccounts;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Extensions\Scribe\Attributes\ResponseFromResource;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Users\DeleteUserSuspensionRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\GetSuspensionsRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\SuspendUserRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\UpdateSuspensionMessageRequest;
use Pterodactyl\Http\Resources\Api\Admin\UserSuspensionResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Support\SupportCaseId;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('User Suspensions', 'Account suspensions: what closed an account, what it is told, and what lifted it.')]
class UserSuspensionController extends AdminApiController
{
    /**
     * List an account's suspension history.
     */
    #[Endpoint('List account suspensions', 'Returns a paginated history of suspensions for one account, newest first. Lifted rows stay: history is not deleted when an account is cleared.')]
    #[QueryParam('filter[status]', 'string', 'active|expired|lifted', required: false, example: 'active')]
    #[ResponseFromResource(UserSuspensionResource::class, UserSuspension::class, description: 'Suspension history returned.', collection: true, resourceKey: 'user_suspension', paginate: 50)]
    public function index(GetSuspensionsRequest $request, User $user): ApiResourceCollection
    {
        $suspensions = QueryBuilder::for(UserSuspension::query()->where('user_id', $user->id))
            ->allowedFilters([AllowedFilter::scope('status')])
            ->allowedSorts(['id', 'created_at', 'expires_at', 'lifted_at'])
            ->defaultSort('-id')
            ->with(['messages', 'servers'])
            ->paginate($request->perPage());

        return UserSuspensionResource::collection($suspensions);
    }

    /**
     * List suspensions across the panel.
     */
    #[Endpoint('List suspensions', 'Returns a paginated list of suspensions for every account, newest first. This is what a support case id is looked up with.')]
    #[QueryParam('filter[support_case_id]', 'string', 'The six-character reference the account holder quotes; letter case does not matter.', required: false, example: 'A7K2P9')]
    #[QueryParam('filter[status]', 'string', 'active|expired|lifted', required: false, example: 'active')]
    #[QueryParam('filter[user_id]', 'integer', 'Suspensions recorded against one account.', required: false, example: 1)]
    #[QueryParam('sort', 'string', 'Sort by id, created_at, expires_at, or lifted_at. Prefix with a hyphen for descending.', required: false, example: '-id')]
    #[ResponseFromResource(UserSuspensionResource::class, UserSuspension::class, description: 'Suspensions returned.', collection: true, resourceKey: 'user_suspension', paginate: 50)]
    public function search(GetSuspensionsRequest $request): ApiResourceCollection
    {
        $suspensions = QueryBuilder::for(UserSuspension::query())
            ->allowedFilters([
                AllowedFilter::callback('support_case_id', function (Builder $query, string $value): void {
                    $this->filterCaseId($query, $value);
                }),
                AllowedFilter::exact('user_id'),
                AllowedFilter::scope('status'),
            ])
            ->allowedSorts(['id', 'created_at', 'expires_at', 'lifted_at'])
            ->defaultSort('-id')
            ->with(['messages', 'servers'])
            ->paginate($request->perPage());

        return UserSuspensionResource::collection($suspensions);
    }

    /**
     * Suspend an account.
     */
    #[Endpoint('Suspend account', 'Closes the account, stops every server it owns, and records the decision under a support case id.')]
    #[ResponseFromResource(UserSuspensionResource::class, UserSuspension::class, status: 201, description: 'Suspension recorded.', resourceKey: 'user_suspension')]
    public function store(SuspendUserRequest $request, User $user, SuspendsAccounts $suspender): JsonResponse
    {
        $validated = $request->validated();

        /** @var string $reason */
        $reason = $validated['reason'];
        /** @var string $message */
        $message = $validated['message'];
        /** @var string|null $note */
        $note = $validated['internal_note'] ?? null;
        /** @var string|null $expiresAt */
        $expiresAt = $validated['expires_at'] ?? null;

        $suspension = $suspender->suspend(
            $user,
            $request->user(),
            SuspensionReason::from($reason),
            $message,
            blank($note) ? null : $note,
            $expiresAt === null ? null : CarbonImmutable::parse($expiresAt),
            filter_var($validated['acknowledge_lockout'] ?? false, FILTER_VALIDATE_BOOLEAN),
        );

        return UserSuspensionResource::make($suspension)
            ->respond(Response::HTTP_CREATED);
    }

    /**
     * Lift the account's active suspension.
     */
    #[Endpoint('Lift account suspension', 'Reopens the account and releases the servers this suspension stopped. No server is powered on.')]
    #[ResponseFromResource(UserSuspensionResource::class, UserSuspension::class, description: 'Lifted suspension returned.', resourceKey: 'user_suspension')]
    public function destroy(DeleteUserSuspensionRequest $request, User $user, UnsuspendsAccounts $unsuspender): JsonResponse
    {
        $suspension = UserSuspension::query()
            ->where('user_id', $user->id)
            ->active()
            ->latest('id')
            ->first();

        if ($suspension === null) {
            throw ValidationException::withMessages([
                'suspension' => 'This account has no active suspension to lift.',
            ]);
        }

        return UserSuspensionResource::make($unsuspender->unsuspend($suspension, $request->user()))
            ->respond(Response::HTTP_OK);
    }

    /**
     * Correct the message an account is shown.
     */
    #[Endpoint('Update suspension message', 'Appends a new version of the message the account holder sees. The text originally issued is kept exactly as it was written.')]
    #[ResponseFromResource(UserSuspensionResource::class, UserSuspension::class, status: 201, description: 'Suspension carrying the new message version.', resourceKey: 'user_suspension')]
    public function message(
        UpdateSuspensionMessageRequest $request,
        User $user,
        EditsSuspensionMessage $editor,
    ): JsonResponse {
        $suspension = $user->activeSuspension()->first();

        if ($suspension === null) {
            throw ValidationException::withMessages([
                'suspension' => 'This account has no active suspension to message about.',
            ]);
        }

        /** @var string $message */
        $message = $request->validated('message');

        $editor->edit($suspension, $message, $request->user());

        return UserSuspensionResource::make($suspension->load(['messages', 'servers']))
            ->respond(Response::HTTP_CREATED);
    }

    /**
     * A reference is typed by hand out of an email or a chat window, so it is upper-cased and
     * checked before it reaches the index. A value that cannot be one is answered as the bad
     * input it is rather than as an empty search an administrator will read as "nobody has
     * used this case".
     *
     * @param  Builder<UserSuspension>  $query
     */
    private function filterCaseId(Builder $query, string $value): void
    {
        $caseId = SupportCaseId::normalize($value);

        if ($caseId === null) {
            throw ValidationException::withMessages([
                'filter.support_case_id' => "Unknown support case id [$value].",
            ]);
        }

        $query->where('support_case_id', $caseId);
    }
}
