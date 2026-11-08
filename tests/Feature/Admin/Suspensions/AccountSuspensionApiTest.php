<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Contracts\Users\SuspendsAccounts;
use Pterodactyl\Enum\AccountStatus;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Jobs\Users\ToggleUserServerSuspension;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;
use Pterodactyl\Models\UserSuspensionServer;
use Pterodactyl\Support\SupportCaseId;

uses(RefreshDatabase::class);

function actingAdmin(): User
{
    $admin = User::factory()->create(['root_admin' => true]);
    Sanctum::actingAs($admin);

    return $admin;
}

function suspend(User $target, array $overrides = []): TestResponse
{
    return test()->postJson("/api/admin/users/$target->id/suspension", [
        'reason' => SuspensionReason::AbuseOfService->value,
        'message' => 'Your account has been suspended while we review reports of abuse.',
        ...$overrides,
    ]);
}

function lift(User $target): TestResponse
{
    return test()->deleteJson("/api/admin/users/$target->id/suspension");
}

it('refuses callers who are not root administrators', function (): void {
    $target = User::factory()->create();
    $suspension = UserSuspension::factory()->forUser($target)->withMessage()->create();

    Sanctum::actingAs(User::factory()->create(['root_admin' => false]));

    suspend($target)->assertForbidden();
    lift($target)->assertForbidden();
    test()->getJson("/api/admin/users/$target->id/suspensions")->assertForbidden();
    test()->postJson("/api/admin/users/$target->id/suspension/message", [
        'message' => 'Long enough to be a real message to the account holder.',
    ])->assertForbidden();
    test()->getJson('/api/admin/suspensions')->assertForbidden();

    // A refused call changes nothing — not the account, and not the record already there.
    expect($suspension->fresh()->isLifted())->toBeFalse()
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Active);
});

it('refuses unauthenticated callers', function (): void {
    $target = User::factory()->create();

    suspend($target)->assertUnauthorized();
    lift($target)->assertUnauthorized();
    test()->getJson("/api/admin/users/$target->id/suspensions")->assertUnauthorized();
});

it('records the closure, the reference, and the message in one decision', function (): void {
    $admin = actingAdmin();
    $target = User::factory()->create();

    suspend($target, ['expires_at' => CarbonImmutable::now()->addDay()->toIso8601String()])
        ->assertCreated()
        ->assertJsonPath('object', 'user_suspension')
        ->assertJsonPath('attributes.user_id', $target->id)
        ->assertJsonPath('attributes.reason', SuspensionReason::AbuseOfService->value)
        ->assertJsonPath('attributes.status', 'active')
        ->assertJsonPath('attributes.is_permanent', false)
        ->assertJsonPath('attributes.created_by', $admin->id);

    /** @var UserSuspension $suspension */
    $suspension = UserSuspension::query()->sole();
    $caseId = $suspension->support_case_id;

    expect($target->fresh()->account_status)->toBe(AccountStatus::Suspended)
        // Six characters from the alphabet that survives being typed into a support ticket.
        ->and($caseId)->toHaveLength(SupportCaseId::LENGTH)
        ->and(SupportCaseId::normalize($caseId))->toBe($caseId)
        ->and($suspension->messages)->toHaveCount(1)
        ->and($suspension->messages[0]->message)->toBe('Your account has been suspended while we review reports of abuse.')
        ->and($suspension->lifted_at)->toBeNull()
        // Closing an account is not deleting one: the row and everything it owns stay.
        ->and(User::query()->whereKey($target->id)->exists())->toBeTrue();

    /** @var ActivityLog $log */
    $log = ActivityLog::query()->where('event', 'admin:user.suspend')->sole();
    expect($log->properties->get('support_case_id'))->toBe($caseId)
        ->and($log->properties->get('reason'))->toBe(SuspensionReason::AbuseOfService->value);
});

it('queues one job per owned server and none for a borrowed seat', function (): void {
    Illuminate\Support\Facades\Queue::fake();
    actingAdmin();
    $target = User::factory()->create();

    $owned = Server::factory()->withRelationships()->create(['owner_id' => $target->id]);
    $someoneElse = Server::factory()->withRelationships()->create();
    Subuser::factory()->create(['user_id' => $target->id, 'server_id' => $someoneElse->id]);

    suspend($target)->assertCreated();

    Illuminate\Support\Facades\Queue::assertPushed(ToggleUserServerSuspension::class, 1);
    Illuminate\Support\Facades\Queue::assertPushed(
        ToggleUserServerSuspension::class,
        fn (ToggleUserServerSuspension $job): bool => $job->server->is($owned)
            && $job->action === TogglesServerSuspension::ACTION_SUSPEND
    );

    // Suspending one account must never reach into another account's server.
    expect($someoneElse->fresh()->status)->toBeNull();
});

it('refuses a second suspension over the one already in force', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    suspend($target)->assertCreated();
    suspend($target)->assertStatus(422);

    expect(UserSuspension::query()->count())->toBe(1)
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Suspended);
});

it('rejects input it could not show an account holder', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    suspend($target, ['reason' => 'not_a_reason'])->assertStatus(422)
        ->assertJsonPath('errors.0.meta.source_field', 'reason');
    suspend($target, ['message' => 'short'])->assertStatus(422)
        ->assertJsonPath('errors.0.meta.source_field', 'message');
    suspend($target, ['expires_at' => CarbonImmutable::now()->subHour()->toIso8601String()])
        ->assertStatus(422)
        ->assertJsonPath('errors.0.meta.source_field', 'expires_at');

    expect(UserSuspension::query()->count())->toBe(0)
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Active);
});

it('refuses to suspend the account you are signed in with', function (): void {
    $admin = actingAdmin();

    suspend($admin, ['internal_note' => 'Explained in the ticket.'])
        ->assertStatus(422)
        ->assertJsonPath('errors.0.meta.source_field', 'user');

    expect($admin->fresh()->account_status)->toBe(AccountStatus::Active);
});

it('warns before closing the last administrator who can still lift anything', function (): void {
    Illuminate\Support\Facades\Queue::fake();

    // The state the guard exists for: a signed-in root that is itself already closed. M4 put a
    // middleware in front of this endpoint that refuses such a caller outright, which is why
    // the guard is reached through the action rather than the route — the guard is for every
    // caller that is not an HTTP request, an extension or a console command using the contract,
    // and it stays correct whatever the middleware in front of it does.
    $actor = User::factory()->create(['root_admin' => true]);
    $actor->forceFill(['account_status' => AccountStatus::Suspended])->save();

    $last = User::factory()->create(['root_admin' => true]);

    $close = fn (bool $acknowledge): UserSuspension => app(SuspendsAccounts::class)->suspend(
        $last,
        $actor,
        SuspensionReason::SecurityViolation,
        'This account was closed while its administrator access was reviewed.',
        'Nothing left to sign back in with.',
        null,
        $acknowledge,
    );

    $errors = [];
    try {
        $close(false);
    } catch (ValidationException $exception) {
        $errors = $exception->errors();
    }

    expect(array_keys($errors))->toBe(['acknowledge_lockout'])
        ->and($last->fresh()->account_status)->toBe(AccountStatus::Active);

    // Acknowledged, it is allowed: the panel can be handed to nobody, as long as somebody said
    // that out loud and it is in the record.
    $close(true);

    expect($last->fresh()->account_status)->toBe(AccountStatus::Suspended)
        ->and(User::query()->where('root_admin', true)
            ->where('account_status', AccountStatus::Active)
            ->count())->toBe(0);
});

it('refuses a suspended administrator the endpoint that would have closed the panel', function (): void {
    $actor = User::factory()->create(['root_admin' => true]);
    $actor->forceFill(['account_status' => AccountStatus::Suspended])->save();
    Sanctum::actingAs($actor);

    $last = User::factory()->create(['root_admin' => true]);

    suspend($last, ['internal_note' => 'Nothing left to sign back in with.'])
        ->assertStatus(403)
        ->assertJsonPath('errors.0.code', 'AccountSuspendedException');

    expect($last->fresh()->account_status)->toBe(AccountStatus::Active)
        ->and(UserSuspension::query()->count())->toBe(0);
});

it('requires an internal note before closing another administrator', function (): void {
    actingAdmin();
    $peer = User::factory()->create(['root_admin' => true]);

    suspend($peer)->assertStatus(422)->assertJsonPath('errors.0.meta.source_field', 'internal_note');

    suspend($peer, ['internal_note' => 'Root keys rotated; review requested by the security team.'])
        ->assertCreated();

    /** @var UserSuspension $suspension */
    $suspension = UserSuspension::query()->where('user_id', $peer->id)->sole();
    expect($suspension->internal_note)->toBe('Root keys rotated; review requested by the security team.');
});

it('lifts the suspension, reopens the account, and releases only its own servers', function (): void {
    Illuminate\Support\Facades\Queue::fake();
    $admin = actingAdmin();
    $target = User::factory()->create();

    $owned = Server::factory()->withRelationships()->create(['owner_id' => $target->id]);
    suspend($target)->assertCreated();

    /** @var UserSuspension $suspension */
    $suspension = UserSuspension::query()->sole();

    // What the suspension actually did to each server is recorded by the job.
    UserSuspensionServer::factory()->forSuspension($suspension)->forServer($owned)->create();

    // A server somebody else had suspended before this account was closed is not this
    // suspension to release.
    $unrelated = Server::factory()->withRelationships()->create(['owner_id' => $target->id, 'status' => 'suspended']);
    UserSuspensionServer::factory()->forSuspension($suspension)->forServer($unrelated)->alreadySuspended()->create();

    lift($target)
        ->assertOk()
        ->assertJsonPath('attributes.status', 'lifted')
        ->assertJsonPath('attributes.lifted_at', fn (?string $value): bool => $value !== null);

    expect($target->fresh()->account_status)->toBe(AccountStatus::Active)
        ->and($suspension->fresh()->isLifted())->toBeTrue()
        ->and($suspension->fresh()->lifted_by)->toBe($admin->id)
        // Lifting is a decision recorded, not a row deleted: the reason and the message stay.
        ->and($suspension->fresh()->messages)->toHaveCount(1);

    // Two pushes: the suspension's own job, and the release the lift queued after it. Only
    // one of them is a release, and only of the server this suspension stopped.
    Illuminate\Support\Facades\Queue::assertPushed(ToggleUserServerSuspension::class, 2);
    Illuminate\Support\Facades\Queue::assertPushed(
        ToggleUserServerSuspension::class,
        fn (ToggleUserServerSuspension $job): bool => $job->action === TogglesServerSuspension::ACTION_UNSUSPEND
            && $job->server->is($owned)
    );
    Illuminate\Support\Facades\Queue::assertNotPushed(
        ToggleUserServerSuspension::class,
        fn (ToggleUserServerSuspension $job): bool => $job->server->is($unrelated)
    );
});
it('appends a message version instead of editing the one issued', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    suspend($target)->assertCreated();

    /** @var UserSuspension $suspension */
    $suspension = UserSuspension::query()->sole();
    /** @var UserSuspensionMessage $original */
    $original = $suspension->messages()->sole();
    $issuedAt = $original->created_at;

    test()->postJson("/api/admin/users/$target->id/suspension/message", [
        'message' => 'Corrected: your account is suspended while we review billing records.',
    ])->assertCreated()
        ->assertJsonPath('attributes.message', 'Corrected: your account is suspended while we review billing records.');

    // The original is still the original: the wording, its identity, and its timestamp.
    expect(UserSuspensionMessage::query()->count())->toBe(2)
        ->and(UserSuspensionMessage::query()->find($original->id)?->message)
        ->toBe('Your account has been suspended while we review reports of abuse.')
        ->and(UserSuspensionMessage::query()->find($original->id)?->created_at?->equalTo($issuedAt))->toBeTrue()
        ->and($suspension->refresh()->current_message?->message)
        ->toBe('Corrected: your account is suspended while we review billing records.')
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Suspended);
});

it('refuses a blank correction, and one for an account that is not suspended', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    test()->postJson("/api/admin/users/$target->id/suspension/message", [
        'message' => 'too short',
    ])->assertStatus(422)->assertJsonPath('errors.0.meta.source_field', 'message');

    test()->postJson("/api/admin/users/$target->id/suspension/message", [
        'message' => 'A message long enough to be shown to anybody.',
    ])->assertStatus(422)->assertJsonPath('errors.0.meta.source_field', 'suspension');

    expect(UserSuspension::query()->count())->toBe(0);
});

it('refuses to correct the message of a suspension that has been lifted', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    $suspension = UserSuspension::factory()->forUser($target)->withMessage()->lifted()->create();

    test()->postJson("/api/admin/users/$target->id/suspension/message", [
        'message' => 'A message long enough to be shown to anybody.',
    ])->assertStatus(422)->assertJsonPath('errors.0.meta.source_field', 'suspension');

    expect($suspension->messages()->count())->toBe(1);
});

it('lists history newest first and filters it by status', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    $older = UserSuspension::factory()->forUser($target)->lifted()->create();
    $newer = UserSuspension::factory()->forUser($target)->expired()->create();

    // An unlifted suspension whose moment has passed is still in force: expiry is a date
    // an administrator named, not a lock that opens itself.
    test()->getJson("/api/admin/users/$target->id/suspensions?filter[status]=active")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.attributes.id', $newer->id)
        ->assertJsonPath('data.0.attributes.status', 'expired');

    test()->getJson("/api/admin/users/$target->id/suspensions?filter[status]=lifted")
        ->assertOk()
        ->assertJsonPath('data.0.attributes.id', $older->id);

    test()->getJson("/api/admin/users/$target->id/suspensions?filter[status]=nonsense")
        ->assertStatus(422)
        ->assertJsonPath('errors.0.meta.source_field', 'filter.status');
});

it('finds the account behind a support case id quoted in any case', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    suspend($target)->assertCreated();
    /** @var UserSuspension $suspension */
    $suspension = UserSuspension::query()->sole();
    $caseId = mb_strtolower($suspension->support_case_id);

    test()->getJson("/api/admin/suspensions?filter[support_case_id]=$caseId")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.attributes.user_id', $target->id)
        ->assertJsonPath('data.0.attributes.support_case_id', mb_strtoupper($caseId));

    // A value that cannot be a reference is answered as bad input, not as an empty list an
    // administrator would read as "nobody has used this case".
    test()->getJson('/api/admin/suspensions?filter[support_case_id]=ZZZ')->assertStatus(422);
});

it('keeps the internal note out of the text an account is shown', function (): void {
    actingAdmin();
    $target = User::factory()->create();

    suspend($target, ['internal_note' => 'Ticket 5521, address shared with a banned range.'])->assertCreated();

    // The note is in the root-only record, and it is nowhere in what the account is told.
    test()->getJson("/api/admin/users/$target->id/suspensions")
        ->assertOk()
        ->assertJsonPath('data.0.attributes.internal_note', 'Ticket 5521, address shared with a banned range.');

    expect(UserSuspensionMessage::query()->pluck('message')->all())
        ->not->toContain('Ticket 5521, address shared with a banned range.');
});

it('cancels a queued server suspension whose account was lifted first', function (): void {
    $target = User::factory()->create();
    $server = Server::factory()->withRelationships()->create(['owner_id' => $target->id]);

    $suspension = UserSuspension::factory()->forUser($target)->withMessage()->lifted()->create();

    // The decision may be reversed while the job is still in the queue; acting on the old
    // one is how an account ends up with stopped servers after being cleared.
    $job = new ToggleUserServerSuspension($suspension, $server, TogglesServerSuspension::ACTION_SUSPEND);
    $job->handle(app(TogglesServerSuspension::class));

    expect(UserSuspensionServer::query()->where('suspension_id', $suspension->id)->sole()->outcome)
        ->toBe(ServerSuspensionOutcome::Cancelled)
        ->and($server->fresh()->status)->toBeNull();
});
