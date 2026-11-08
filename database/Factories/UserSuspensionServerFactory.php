<?php

declare(strict_types=1);

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Enum\ServerSuspensionOutcome;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionServer;

/**
 * @extends Factory<UserSuspensionServer>
 */
class UserSuspensionServerFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = UserSuspensionServer::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        // Built with its node, allocation, and egg because that is the only shape a server
        // exists in, and a row here names one. Tests that care which server is usually
        // calling forServer(), which replaces this entirely.
        $server = Server::factory()->withRelationships()->create();

        return [
            'suspension_id' => UserSuspension::factory(),
            'server_id' => $server->id,
            // Quoted from the server the row names rather than invented: the uuid is kept so
            // that the record can still be read after the server itself is gone.
            'server_uuid' => $server->uuid,
            'wings_state_before' => 'stopped',
            'outcome' => ServerSuspensionOutcome::Suspended,
            'failure' => null,
        ];
    }

    public function outcome(ServerSuspensionOutcome $outcome, ?string $failure = null): self
    {
        return $this->state(fn (): array => ['outcome' => $outcome, 'failure' => $failure]);
    }

    /**
     * The suspension this row belongs to. A row is always written against the suspension
     * that queued the server, so a test naming it is the normal case, not an override.
     */
    public function forSuspension(UserSuspension $suspension): self
    {
        return $this->state(fn (): array => ['suspension_id' => $suspension->id]);
    }

    /**
     * Name the server this row describes. A suspension only ever records servers owned by
     * the account it closed, so a test that wants that shape passes its own server.
     */
    public function forServer(Server $server): self
    {
        return $this->state(fn (): array => ['server_id' => $server->id, 'server_uuid' => $server->uuid]);
    }

    /** Mid-transfer: the retry command is what eventually acts on this server. */
    public function deferred(): self
    {
        return $this->state(fn (): array => [
            'outcome' => ServerSuspensionOutcome::Deferred,
            'wings_state_before' => null,
            'failure' => null,
        ]);
    }

    /** The daemon refused: the row says so, and nothing claims the server was stopped. */
    public function failed(string $exception = 'Pterodactyl\\Exceptions\\Http\\Connection\\DaemonConnectionException'): self
    {
        return $this->state(fn (): array => [
            'outcome' => ServerSuspensionOutcome::Failed,
            'failure' => $exception,
        ]);
    }

    /** Stopped by somebody else before this suspension, so lifting must not release it. */
    public function alreadySuspended(): self
    {
        return $this->state(fn (): array => [
            'outcome' => ServerSuspensionOutcome::AlreadySuspended,
            'wings_state_before' => null,
        ]);
    }

    public function released(): self
    {
        return $this->state(fn (): array => ['outcome' => ServerSuspensionOutcome::Released]);
    }
}
