<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Pterodactyl\Console\Commands\Maintenance\LiftExpiredSuspensionsCommand;
use Pterodactyl\Console\Commands\Maintenance\RetryDeferredAccountSuspensionsCommand;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Enum\AccountStatus;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Jobs\Users\ToggleUserServerSuspension;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;

uses(RefreshDatabase::class);

it('re-queues only the servers of suspensions still in force', function (): void {
    Queue::fake();

    $target = User::factory()->create();
    $server = Server::factory()->withRelationships()->create(['owner_id' => $target->id]);

    $stuck = UserSuspension::factory()->forUser($target)->withMessage()->create();
    UserSuspensionServer::factory()->forSuspension($stuck)->forServer($server)->deferred()->create();

    $done = UserSuspension::factory()->forUser($target)->lifted()->create();
    UserSuspensionServer::factory()->forSuspension($done)->forServer($server)->deferred()->create();

    test()->artisan(RetryDeferredAccountSuspensionsCommand::class)->assertExitCode(0);

    Queue::assertPushed(ToggleUserServerSuspension::class, 1);
    Queue::assertPushed(
        ToggleUserServerSuspension::class,
        fn (ToggleUserServerSuspension $job): bool => $job->suspension->is($stuck)
            && $job->action === TogglesServerSuspension::ACTION_SUSPEND
    );

    // Nothing about the outcome changes until the daemon answers: the row still says the
    // attempt was deferred, which is what the next run will act on.
    expect($stuck->servers()->sole()->outcome)->toBe(ServerSuspensionOutcome::Deferred);
});

it('leaves a server that is gone for good', function (): void {
    Queue::fake();

    $target = User::factory()->create();
    $server = Server::factory()->withRelationships()->create(['owner_id' => $target->id]);
    $suspension = UserSuspension::factory()->forUser($target)->withMessage()->create();
    UserSuspensionServer::factory()->forSuspension($suspension)->forServer($server)->failed()->create();

    $server->delete();

    test()->artisan(RetryDeferredAccountSuspensionsCommand::class)->assertExitCode(0);

    // The row survives its server: it is the record of what was stopped, not a pointer.
    Queue::assertNotPushed(ToggleUserServerSuspension::class);
    expect(UserSuspensionServer::query()->count())->toBe(1);
});

it('lifts nothing while the setting is off', function (): void {
    config()->set('pterodactyl.security.auto_lift_expired', false);

    $target = User::factory()->create();
    $suspension = UserSuspension::factory()->forUser($target)->expired()->create();
    $target->forceFill(['account_status' => AccountStatus::Suspended])->save();

    test()->artisan(LiftExpiredSuspensionsCommand::class)->assertExitCode(0);

    expect($suspension->fresh()->isLifted())->toBeFalse()
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Suspended);
});

it('lifts only what has actually expired, and names nobody as the lifter', function (): void {
    config()->set('pterodactyl.security.auto_lift_expired', true);
    Queue::fake();

    $expired = User::factory()->create();
    $future = User::factory()->create();
    $permanent = User::factory()->create();

    $expiredSuspension = UserSuspension::factory()->forUser($expired)->expired()->create();
    UserSuspension::factory()->forUser($future)->expiresAt(CarbonImmutable::now()->addDay())->create();
    UserSuspension::factory()->forUser($permanent)->permanent()->create();

    foreach ([$expired, $future, $permanent] as $account) {
        $account->forceFill(['account_status' => AccountStatus::Suspended])->save();
    }

    test()->artisan(LiftExpiredSuspensionsCommand::class)->assertExitCode(0);

    expect($expiredSuspension->fresh()->isLifted())->toBeTrue()
        // The lift belongs to the clock, not to whoever is signed in.
        ->and($expiredSuspension->fresh()->lifted_by)->toBeNull()
        ->and($expired->fresh()->account_status)->toBe(AccountStatus::Active)
        ->and($future->fresh()->account_status)->toBe(AccountStatus::Suspended)
        ->and($permanent->fresh()->account_status)->toBe(AccountStatus::Suspended);
});

it('refuses to open an account another suspension still holds closed', function (): void {
    config()->set('pterodactyl.security.auto_lift_expired', true);

    $target = User::factory()->create();
    $expired = UserSuspension::factory()->forUser($target)->expired()->create();
    UserSuspension::factory()->forUser($target)->permanent()->create();
    $target->forceFill(['account_status' => AccountStatus::Suspended])->save();

    test()->artisan(LiftExpiredSuspensionsCommand::class)->assertExitCode(0);

    expect($expired->fresh()->isLifted())->toBeTrue()
        ->and($target->fresh()->account_status)->toBe(AccountStatus::Suspended);
});
