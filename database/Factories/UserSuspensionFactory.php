<?php

declare(strict_types=1);

namespace Database\Factories;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Enum\SuspensionReason;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserSuspension;
use Pterodactyl\Models\UserSuspensionMessage;
use Pterodactyl\Support\SupportCaseId;

/**
 * @extends Factory<UserSuspension>
 */
class UserSuspensionFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = UserSuspension::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            // Generated, not faked: the point of the column is that it is a reference nobody
            // else answers to, and a test that builds one by hand would not catch a factory
            // inventing a shape the panel never writes.
            'support_case_id' => SupportCaseId::generate(),
            'reason' => SuspensionReason::SuspiciousActivity,
            'internal_note' => null,
            'expires_at' => null,
            'created_by' => User::factory()->admin(),
        ];
    }

    /**
     * Attach the version of the message the account was shown. A suspension created by the
     * action always has one; a factory-built row without it is a shape only a test wants.
     */
    public function withMessage(string $message = 'Your account has been suspended.'): self
    {
        return $this->afterCreating(function (UserSuspension $suspension) use ($message): void {
            UserSuspensionMessage::query()->create([
                'suspension_id' => $suspension->id,
                'message' => $message,
                'created_by' => $suspension->created_by,
            ]);
        });
    }

    public function reason(SuspensionReason $reason): self
    {
        return $this->state(fn (): array => ['reason' => $reason]);
    }

    /**
     * The account this suspension was written against. Recorded against a different account
     * than the one the test is exercising is how a history test starts lying.
     */
    public function forUser(User $user): self
    {
        return $this->state(fn (): array => ['user_id' => $user->id]);
    }

    /**
     * Closed by an administrator: the account is back, the record is not deleted.
     */
    public function lifted(?CarbonImmutable $at = null): self
    {
        return $this->state(fn (): array => [
            'lifted_at' => $at ?? CarbonImmutable::now(),
            'lifted_by' => null,
        ]);
    }

    public function note(?string $note): self
    {
        return $this->state(fn (): array => ['internal_note' => $note]);
    }

    /** A suspension that names no end date, which is the default. */
    public function permanent(): self
    {
        return $this->state(fn (): array => ['expires_at' => null]);
    }

    public function expiresAt(?CarbonImmutable $at): self
    {
        return $this->state(fn (): array => ['expires_at' => $at]);
    }

    /**
     * Already past its end date: still enforced, because lifting on expiry is a setting.
     */
    public function expired(): self
    {
        return $this->state(fn (): array => ['expires_at' => CarbonImmutable::now()->subHour()]);
    }
}
