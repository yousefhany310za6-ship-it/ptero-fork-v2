<?php

declare(strict_types=1);

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Enum\LoginEventOutcome;
use Pterodactyl\Models\LoginEvent;
use Pterodactyl\Models\User;
use Pterodactyl\Support\Network\IpAddressNormalizer;
use RuntimeException;

/**
 * @extends Factory<LoginEvent>
 */
class LoginEventFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = LoginEvent::class;

    /**
     * Define the model's default state: a failed attempt at an account that does not exist,
     * which is the shape an administrator most needs history for.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => null,
            'user_uuid' => null,
            'username_attempted' => 'nobody',
            'ip_address' => $this->bytes('198.51.100.23'),
            'outcome' => LoginEventOutcome::Failed,
            'reason_code' => 'account_not_found',
            'ip_ban_id' => null,
            'suspension_case_id' => null,
            'user_agent' => 'Mozilla/5.0 (Automated test client)',
            'fingerprint' => null,
        ];
    }

    /**
     * The address the attempt arrived from, normalised by the same parser the panel stores
     * and matches with, so a factory cannot invent bytes that enforcement would never see.
     */
    public function from(string $address): self
    {
        return $this->state(fn (): array => ['ip_address' => $this->bytes($address)]);
    }

    /**
     * Name the account the attempt was made against. Passing no account is how an attempt at
     * an unknown username is built: the row keeps the name that was typed and no id at all.
     */
    public function against(?User $user, ?string $attempted = null): self
    {
        return $this->state(fn (): array => [
            'user_id' => $user?->id,
            'user_uuid' => $user?->uuid,
            'username_attempted' => $attempted ?? $user?->username,
        ]);
    }

    public function outcome(LoginEventOutcome $outcome, ?string $reason = null): self
    {
        return $this->state(fn (): array => [
            'outcome' => $outcome,
            'reason_code' => $reason,
        ]);
    }

    private function bytes(string $address): string
    {
        $parsed = IpAddressNormalizer::parse($address);
        if ($parsed === null) {
            throw new RuntimeException("[$address] is not an address this factory can build.");
        }

        return $parsed->bytes;
    }
}
