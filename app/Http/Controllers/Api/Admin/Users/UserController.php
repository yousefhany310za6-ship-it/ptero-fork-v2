<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Users;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Contracts\Users\CreatesUsers;
use Pterodactyl\Contracts\Users\DeletesUsers;
use Pterodactyl\Contracts\Users\UpdatesUsers;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Extensions\Scribe\Attributes\ExtensionFieldsParam;
use Pterodactyl\Extensions\Scribe\Attributes\ResponseFromResource;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Users\DeleteUserRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\GetUserRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\GetUsersRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\StoreUserRequest;
use Pterodactyl\Http\Requests\Api\Admin\Users\UpdateUserRequest;
use Pterodactyl\Http\Resources\Api\Admin\UserResource;
use Pterodactyl\Http\Resources\Api\ApiResourceCollection;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Support\SupportCaseId;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Users', 'Create, update, retrieve, and delete panel users.')]
class UserController extends AdminApiController
{
    private const array DELETE_SELF_ERROR = [
        'errors' => [
            [
                'code' => 'DisplayException',
                'status' => '400',
                'detail' => 'You cannot delete your own account.',
            ],
        ],
    ];

    /**
     * List users.
     */
    #[Endpoint('List users', 'Returns a paginated list of panel users, sorted with root administrators first by default.')]
    #[QueryParam('page', 'integer', 'Page number to retrieve.', required: false, example: 1)]
    #[QueryParam('per_page', 'integer', 'Results to return per page.', required: false, example: 50)]
    #[QueryParam('filter[email]', 'string', 'Filter users by email address.', required: false, example: 'admin@example.com')]
    #[QueryParam('filter[uuid]', 'string', 'Filter users by UUID.', required: false, example: '1b19cf3f-2f89-4f88-a81e-321e7fe326bc')]
    #[QueryParam('filter[username]', 'string', 'Filter users by username.', required: false, example: 'admin')]
    #[QueryParam('filter[external_id]', 'string', 'Filter users by external identifier.', required: false, example: 'remote-123')]
    #[QueryParam('filter[search]', 'string', 'Search users by username, email, UUID, or the support case id of a suspension recorded against them.', required: false, example: 'admin')]
    #[QueryParam('filter[account_status]', 'string', 'Restrict the list to accounts that may sign in, or to those that are closed.', required: false, example: 'suspended', enum: ['active', 'suspended'])]
    #[QueryParam('sort', 'string', 'Sort users by id, uuid, email, username, or creation date. Prefix with a hyphen for descending order.', required: false, example: '-created_at')]
    #[ResponseFromResource(UserResource::class, User::class, description: 'Users returned.', collection: true, resourceKey: 'user', paginate: 50)]
    public function index(GetUsersRequest $request): ApiResourceCollection
    {
        $users = QueryBuilder::for(
            User::query()
                ->select('users.*')
                ->selectSub(
                    Subuser::query()
                        ->selectRaw('COUNT(*)')
                        ->whereColumn('subusers.user_id', 'users.id'),
                    'subuser_of_count'
                )
                // The two columns an administrator reads beside a name: when the account last
                // proved a password, and from where it did so. Both come from sign-in history
                // rather than from a column on `users`, because history is the record that
                // already answers "when" and "from where" — a second copy on the account row
                // would be a second answer, and the two would drift the moment one is written
                // and the other is not. Each is one indexed lookup for one row of the page.
                ->selectSub(
                    LoginEvent::query()
                        ->select('created_at')
                        ->whereColumn('login_events.user_id', 'users.id')
                        ->where('outcome', LoginEventOutcome::Success->value)
                        ->orderByDesc('id')
                        ->limit(1),
                    'last_login_at'
                )
                ->selectSub(
                    LoginEvent::query()
                        // Hex, because the column is bytes and a bytes value carried through a
                        // subquery arrives as a resource handle on some drivers.
                        ->selectRaw('HEX(ip_address)')
                        ->whereColumn('login_events.user_id', 'users.id')
                        ->orderByDesc('id')
                        ->limit(1),
                    'last_ip'
                )
                ->with('activeSuspension')
                ->withCount('servers')
        )
            ->allowedFilters([
                'email',
                'uuid',
                'username',
                'external_id',
                AllowedFilter::exact('account_status'),
                AllowedFilter::callback('search', function (Builder $builder, string $value): void {
                    $builder->where(function (Builder $builder) use ($value): void {
                        $builder
                            ->where('users.username', 'LIKE', "%{$value}%")
                            ->orWhere('users.email', 'LIKE', "%{$value}%")
                            ->orWhere('users.uuid', 'LIKE', "%{$value}%");

                        // A quoted reference is the one thing an account holder can give an
                        // administrator, and it is what they will type into this box. Only a
                        // value that is a case id at all is looked up as one: anything else
                        // stays an ordinary search rather than a mistaken exact match.
                        $caseId = SupportCaseId::normalize($value);
                        if ($caseId !== null) {
                            $builder->orWhereExists(
                                UserSuspension::query()
                                    ->selectRaw('1')
                                    ->whereColumn('user_suspensions.user_id', 'users.id')
                                    ->where('user_suspensions.support_case_id', $caseId)
                            );
                        }
                    });
                }),
            ])
            ->defaultSort('-root_admin')
            ->allowedSorts(['id', 'uuid', 'email', 'username', 'created_at'])
            ->paginate($request->perPage());

        return UserResource::collection($users);
    }

    /**
     * Show user.
     */
    #[Endpoint('Get user', 'Returns a single panel user by internal numeric ID.')]
    #[QueryParam('include', 'string', 'Comma-separated relationships to include. Supports servers.', required: false, example: 'servers')]
    #[ResponseFromResource(UserResource::class, User::class, description: 'User returned.', resourceKey: 'user', include: ['servers'])]
    public function show(GetUserRequest $request, User $user): UserResource
    {
        return UserResource::make($user)->withExtensionFields();
    }

    /**
     * Create user.
     */
    #[Endpoint('Create user', 'Creates a panel user. Optional password and language fields may be supplied explicitly.')]
    #[ResponseFromResource(UserResource::class, User::class, status: 201, description: 'User created.', resourceKey: 'user', meta: ['resource' => 'https://panel.example.com/api/admin/users/1'])]
    #[ExtensionFieldsParam]
    public function store(StoreUserRequest $request, CreatesUsers $users): JsonResponse
    {
        $user = $users->create($request->actionInput());

        // The action logs the new account on the user's own feed.
        Activity::event('admin:user.create')
            ->property('email', $user->email)
            ->log();

        return UserResource::make($user)
            ->withExtensionFields()
            ->withMeta([
                'resource' => route('api.admin.users.view', [
                    'user' => $user->id,
                ]),
            ])
            ->respond(Response::HTTP_CREATED);
    }

    /**
     * Update user.
     */
    #[Endpoint('Update user', 'Updates an existing panel user. Supplying a password changes the user password.')]
    #[ResponseFromResource(UserResource::class, User::class, description: 'User updated.', resourceKey: 'user')]
    #[ExtensionFieldsParam]
    public function update(UpdateUserRequest $request, UpdatesUsers $users, User $user): UserResource
    {
        $user = $users->update($user, $request->actionInput());

        Activity::event('admin:user.update')
            ->subject($user)
            ->property('email', $user->email)
            ->log();

        return UserResource::make($user)->withExtensionFields();
    }

    /**
     * Delete user.
     */
    #[Endpoint('Delete user', 'Deletes a panel user. The authenticated administrator cannot delete their own account.')]
    #[ScribeResponse(status: 204, description: 'User deleted.')]
    #[ScribeResponse(self::DELETE_SELF_ERROR, status: 400, description: 'The authenticated administrator attempted to delete their own user account.')]
    public function destroy(DeleteUserRequest $request, DeletesUsers $users, User $user): Response
    {
        if ($request->user()->is($user)) {
            throw new DisplayException(__('admin/user.exceptions.delete_self'));
        }

        $users->delete($user);

        Activity::event('admin:user.delete')
            ->subject($user)
            ->property('email', $user->email)
            ->log();

        return $this->returnNoContent();
    }
}
