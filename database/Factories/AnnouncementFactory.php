<?php

declare(strict_types=1);

namespace Database\Factories;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Models\Announcement;

/**
 * @extends Factory<Announcement>
 */
class AnnouncementFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Announcement::class;

    /**
     * Define the model's default state: an unread draft.
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(3, true),
            'title' => fake()->sentence(4),
            'body' => fake()->paragraphs(2, true),
            'kind' => 'info',
            'status' => 'draft',
            'policy' => 'once',
            'require_ack' => false,
            'interval_hours' => null,
            'audience' => ['type' => 'all'],
            'content_version' => 1,
        ];
    }

    public function published(): self
    {
        return $this->state(fn (): array => [
            'status' => 'published',
            'publish_at' => CarbonImmutable::now()->subMinute(),
            'published_at' => CarbonImmutable::now()->subMinute(),
        ]);
    }

    public function scheduled(?CarbonImmutable $at = null): self
    {
        return $this->state(fn (): array => [
            'status' => 'scheduled',
            'publish_at' => ($at ?? CarbonImmutable::now()->addDay()),
        ]);
    }

    public function expired(): self
    {
        return $this->state(fn (): array => [
            'status' => 'published',
            'publish_at' => CarbonImmutable::now()->subDay(),
            'published_at' => CarbonImmutable::now()->subDay(),
            'expires_at' => CarbonImmutable::now()->subHour(),
        ]);
    }

    public function critical(bool $requireAck = false): self
    {
        return $this->state(fn (): array => [
            'kind' => 'critical',
            'require_ack' => $requireAck,
        ]);
    }
}
