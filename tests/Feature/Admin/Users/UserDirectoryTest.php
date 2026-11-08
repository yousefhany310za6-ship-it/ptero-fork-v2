<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Pterodactyl\Contracts\Users\SuspendsAccounts;
use Pterodactyl\Contracts\Users\UnsuspendsAccounts;
use Pterodactyl\Enum\AccountStatus;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;

uses(RefreshDatabase::class);

function directoryAdmin(): User
{
    $admin = User::factory()->create(['root_admin' => true]);
    Sanctum::actingAs($admin);

    return $admin;
}

function closedCaseId(User $target, User $admin): string
{
    app(SuspendsAccounts::class)->suspend(
        $target,
        $admin,
        SuspensionReason::SuspiciousActivity,
        'Your account is closed while we look into activity reported against it.',
        null,
        null,
        false
    );

    return $target->fresh()->activeSuspension->support_case_id;
}

function listUsers(string $query = ''): Illuminate\Testing\TestResponse
{
    return test()->getJson('/api/admin/users'.($query === '' ? '' : '?'.$query));
}

it('says what an account is and under what reference it would be quoted', function (): void {
    $admin = directoryAdmin();
    $open = User::factory()->create(['username' => 'opentelemetry']);
    $closed = User::factory()->create(['username' => 'closedaccount']);
    $caseId = closedCaseId($closed, $admin);

    $rows = collect(listUsers()->json('data'))->keyBy('attributes.username');

    expect($rows['opentelemetry']['attributes']['account_status'])->toBe(AccountStatus::Active->value)
        ->and($rows['opentelemetry']['attributes']['support_case_id'])->toBeNull()
        ->and($rows['closedaccount']['attributes']['account_status'])->toBe(AccountStatus::Suspended->value)
        ->and($rows['closedaccount']['attributes']['support_case_id'])->toBe($caseId);
});

it('lists the accounts an administrator is looking for by status', function (): void {
    $admin = directoryAdmin();
    $open = User::factory()->create(['username' => 'stillopen']);
    $closed = User::factory()->create(['username' => 'shutdown']);
    closedCaseId($closed, $admin);

    $suspended = collect(listUsers('filter[account_status]=suspended')->json('data'))
        ->map(fn (array $row): string => $row['attributes']['username']);

    $active = collect(listUsers('filter[account_status]=active')->json('data'))
        ->map(fn (array $row): string => $row['attributes']['username']);

    expect($suspended->all())->toBe([$closed->username])
        // Filtering is not a search: the closed account is simply not in the list of those that
        // may sign in, whatever else is there.
        ->and($active->contains($open->username))->toBeTrue()
        ->and($active->contains($closed->username))->toBeFalse();
});

it('finds an account from the six characters its holder was told to quote', function (): void {
    $admin = directoryAdmin();
    $closed = User::factory()->create(['username' => 'quotedaccount']);
    $caseId = closedCaseId($closed, $admin);

    // The reference reaches an administrator in a ticket, in whatever case the writer used, and
    // is the only thing the account holder has to give.
    expect(listUsers('filter[search]='.mb_strtolower($caseId))->json('data.0.attributes.username'))
        ->toBe($closed->username)
        ->and(listUsers('filter[search]='.$caseId)->json('data.0.attributes.username'))->toBe($closed->username)
        // A value that is not a reference at all stays an ordinary search rather than an exact
        // match on nothing.
        ->and(listUsers('filter[search]=zzqq')->json('data'))->toBeArray()->toHaveCount(0);
});

it('still finds the account after its reference has been lifted', function (): void {
    $admin = directoryAdmin();
    $closed = User::factory()->create(['username' => 'reopened']);
    $caseId = closedCaseId($closed, $admin);

    app(UnsuspendsAccounts::class)->unsuspend($closed->activeSuspension, $admin);

    expect($closed->fresh()->account_status)->toBe(AccountStatus::Active)
        // The list carries no reference for an account that is open again...
        ->and(listUsers('filter[search]=reopened')->json('data.0.attributes.support_case_id'))->toBeNull()
        // ...and yet the case an account holder quotes still resolves to the account it closed.
        ->and(listUsers('filter[search]='.$caseId)->json('data.0.attributes.username'))->toBe('reopened');
});

it('reads when an account last signed in and from where', function (): void {
    directoryAdmin();
    $user = User::factory()->create(['username' => 'twiceused']);
    $other = User::factory()->create(['username' => 'somebodyelse']);

    LoginEvent::factory()->against($other)->outcome(LoginEventOutcome::Success)->from('198.51.100.9')->create();
    $login = LoginEvent::factory()->against($user)->outcome(LoginEventOutcome::Success)->from('203.0.2.5')->create();
    // A refusal afterwards is not a sign-in, and the address it came from is still the address
    // support will be told about.
    $refused = LoginEvent::factory()->against($user)
        ->outcome(LoginEventOutcome::Failed, 'bad_password')
        ->from('2001:db8::ff00:42:8329')
        ->create();

    $row = collect(listUsers('filter[search]=twiceused')->json('data'))
        ->firstWhere('attributes.id', $user->id);

    expect($row['attributes']['last_login_at'])->toStartWith($login->created_at->format('Y-m-d'))
        ->and($row['attributes']['last_ip'])->toBe($refused->address()->label())
        // One account's address is never another's, however the rows are ordered.
        ->and(collect(listUsers('filter[search]=somebodyelse')->json('data'))
            ->firstWhere('attributes.id', $other->id)['attributes']['last_ip'])->toBe('198.51.100.9');
});

it('has no sign-in to report for an account that has never arrived', function (): void {
    directoryAdmin();
    $nobody = User::factory()->create(['username' => 'neversignedin']);

    $row = listUsers('filter[search]=neversignedin')->json('data.0.attributes');

    expect($row['last_login_at'])->toBeNull()
        ->and($row['last_ip'])->toBeNull()
        ->and($row['account_status'])->toBe(AccountStatus::Active->value);
});

it('answers an account\'s page with the actions taken against it', function (): void {
    $admin = directoryAdmin();
    $closed = User::factory()->create(['username' => 'actedupon']);
    $other = User::factory()->create(['username' => 'unrelated']);

    $caseId = closedCaseId($closed, $admin);
    closedCaseId($other, $admin);

    $response = test()->getJson('/api/admin/activity?filter[subject_id]='.$closed->id);

    $response->assertOk();

    $events = collect($response->json('data'))->map(fn (array $row): array => $row['attributes']);

    expect($events)->toHaveCount(1)
        ->and($events[0]['event'])->toBe('admin:user.suspend')
        ->and($events[0]['properties']['support_case_id'])->toBe($caseId)
        // An unrelated closure is not this account's story.
        ->and($other->activity()->count())->toBe(1);
});

it('refuses a subject filter it cannot name an account with', function (): void {
    directoryAdmin();

    test()->getJson('/api/admin/activity?filter[subject_id]=0')->assertUnprocessable();
    test()->getJson('/api/admin/activity?filter[subject_id]=not-a-user')->assertUnprocessable();
});

it('keeps the record of a closure when the list is filtered', function (): void {
    $admin = directoryAdmin();
    $closed = User::factory()->create(['username' => 'historykept']);
    $caseId = closedCaseId($closed, $admin);

    app(UnsuspendsAccounts::class)->unsuspend($closed->activeSuspension, $admin);

    expect(UserSuspension::query()->where('user_id', $closed->id)->count())->toBe(1)
        ->and(ActivityLog::query()->where('event', 'admin:user.unsuspend')->count())->toBe(1)
        ->and(test()->getJson("/api/admin/users/$closed->id/suspensions")->assertOk()
            ->json('data.0.attributes.support_case_id'))->toBe($caseId)
        // Nothing about the account was deleted on the way back to being usable.
        ->and($closed->fresh()->username)->toBe('historykept')
        ->and(CarbonImmutable::parse($closed->fresh()->created_at))->toBeLessThan(CarbonImmutable::now());
});
