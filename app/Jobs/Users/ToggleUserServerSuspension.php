<?php

declare(strict_types=1);

namespace Pterodactyl\Jobs\Users;

use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;
use Illuminate\Queue\Attributes\WithoutRelations;
use Pterodactyl\Contracts\Servers\TogglesServerSuspension;
use Pterodactyl\Data\ServerState;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Throwable;

/**
 * Applies one server of a suspended account, in one direction.
 *
 * One job per server because an account can own dozens of them, each on a different node,
 * and the request that suspended the account has to come back before any of that happens.
 *
 * The work itself is delegated to `TogglesServerSuspension` — the same action the server
 * suspension endpoint uses — so this inherits its rollback when Wings refuses, its
 * duplicate-state short circuit, and its refusal to touch a server that is being
 * transferred. Inventing a second path to the daemon is how a panel ends up believing its
 * own database instead of the machine running the containers.
 */
#[DeleteWhenMissingModels]
class ToggleUserServerSuspension implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $maxExceptions = 1;

    public int $timeout = 60;

    /** @var list<int> */
    public array $backoff = [10, 30, 60];

    public function __construct(
        #[WithoutRelations]
        public readonly UserSuspension $suspension,
        #[WithoutRelations]
        public readonly Server $server,
        public readonly string $action,
    ) {}

    /**
     * One attempt per server per suspension per direction, so an administrator retrying a
     * suspension that is already being worked on queues nothing.
     */
    public function uniqueId(): string
    {
        return sprintf('user-suspension:%d:server:%d:%s', $this->suspension->id, $this->server->id, $this->action);
    }

    public function handle(TogglesServerSuspension $toggle): void
    {
        $isSuspending = $this->action === TogglesServerSuspension::ACTION_SUSPEND;

        // The decision may have been reversed while this was in the queue. Acting on the
        // old decision is how an account ends up with stopped servers after being cleared.
        if ($isSuspending === $this->suspension->isLifted()) {
            $this->record(ServerSuspensionOutcome::Cancelled);

            return;
        }

        if ($isSuspending) {
            $this->suspend($toggle);

            return;
        }

        $this->unsuspend($toggle);
    }

    private function suspend(TogglesServerSuspension $toggle): void
    {
        if ($this->server->isSuspended()) {
            $this->record(ServerSuspensionOutcome::AlreadySuspended);

            return;
        }

        $state = $this->observedState();

        try {
            $toggle->toggle($this->server, TogglesServerSuspension::ACTION_SUSPEND);
        } catch (ConflictHttpException) {
            // Mid-transfer. The action refused rather than failing, so the retry command
            // tries again once the transfer is over instead of Wings being blamed.
            $this->record(ServerSuspensionOutcome::Deferred, $state);

            return;
        } catch (DaemonConnectionException $exception) {
            $this->record(ServerSuspensionOutcome::Failed, $state, $exception::class);

            return;
        }

        $this->record(ServerSuspensionOutcome::Suspended, $state);
    }

    /**
     * Take a server off the account's suspension.
     *
     * This clears the suspended status and nothing else. No power signal is ever sent here,
     * deliberately: `wings_state_before` may well say the container was running when the
     * account was suspended, and starting it now would be exactly the automatic power-on the
     * panel was told not to perform — an account holder who had stopped their own server
     * before the suspension would find it running again after a lift.
     */
    private function unsuspend(TogglesServerSuspension $toggle): void
    {
        if (! $this->server->isSuspended()) {
            $this->record(ServerSuspensionOutcome::Cancelled);

            return;
        }

        try {
            $toggle->toggle($this->server, TogglesServerSuspension::ACTION_UNSUSPEND);
        } catch (ConflictHttpException) {
            $this->record(ServerSuspensionOutcome::Deferred);

            return;
        } catch (DaemonConnectionException $exception) {
            $this->record(ServerSuspensionOutcome::Failed, failure: $exception::class);

            return;
        }

        $this->record(ServerSuspensionOutcome::Released);
    }

    private function record(
        ServerSuspensionOutcome $outcome,
        ?string $state = null,
        ?string $failure = null,
    ): void {
        $record = UserSuspensionServer::query()->firstOrNew([
            'suspension_id' => $this->suspension->id,
            'server_id' => $this->server->id,
        ]);

        $record->server_uuid = $this->server->uuid;
        $record->outcome = $outcome;
        $record->failure = $failure;

        // Only a suspension attempt ever learns the prior state, so an unsuspension must not
        // erase the quotation the attempt before it wrote down.
        if ($state !== null) {
            $record->wings_state_before = $state;
        }

        $record->save();
    }

    /**
     * What the daemon said this server was doing, immediately before it was touched, or null
     * when the node did not answer. Evidence for an administrator asking whether suspending
     * the account interrupted something; nothing reads it to decide what to do next.
     */
    private function observedState(): ?string
    {
        try {
            return ServerState::fromDaemon(Daemon::server($this->server)->details())->state;
        } catch (Throwable) {
            return null;
        }
    }
}
