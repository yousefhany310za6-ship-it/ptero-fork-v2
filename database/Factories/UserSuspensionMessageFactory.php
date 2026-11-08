<?php

declare(strict_types=1);

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;

/**
 * @extends Factory<UserSuspensionMessage>
 */
class UserSuspensionMessageFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = UserSuspensionMessage::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'suspension_id' => UserSuspension::factory(),
            'message' => 'Your account has been suspended pending a review.',
            'created_by' => User::factory()->admin(),
        ];
    }

    /**
     * The account holder is told nothing they cannot repeat, so a test can build the public
     * text without touching the internal note it must never contain.
     */
    public function text(string $message): self
    {
        return $this->state(fn (): array => ['message' => $message]);
    }
}
