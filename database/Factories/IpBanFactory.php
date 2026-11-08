<?php

declare(strict_types=1);

namespace Database\Factories;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Models\IpBan;
use Pterodactyl\Support\Network\IpAddressNormalizer;
use RuntimeException;

/**
 * @extends Factory<IpBan>
 */
class IpBanFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = IpBan::class;

    /**
     * Define the model's default state: a permanent ban on one documentation host.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [...$this->bounds('198.51.100.23'), 'expires_at' => null];
    }

    /**
     * Ban exactly the range the given address or CIDR covers, worked out by the same
     * normalizer the panel uses, so a factory cannot invent bounds the parser would
     * never produce. It changes only the bounds: a state applied before this one —
     * `temporary()` — keeps its expiry rather than being silently reset to permanent.
     */
    public function range(string $cidr): self
    {
        return $this->state(fn (): array => $this->bounds($cidr));
    }

    public function temporary(?CarbonImmutable $expiresAt = null): self
    {
        return $this->state(fn (): array => [
            'expires_at' => $expiresAt ?? CarbonImmutable::now()->addHour(),
        ]);
    }

    public function expired(): self
    {
        return $this->state(fn (): array => [
            'expires_at' => CarbonImmutable::now()->subMinute(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function bounds(string $cidr): array
    {
        $network = IpAddressNormalizer::network($cidr);
        if ($network === null) {
            throw new RuntimeException("[$cidr] is not an address or range this factory can build.");
        }

        return [
            'first_ip' => $network->first,
            'last_ip' => $network->last,
            'cidr_label' => $network->isSingleAddress() ? null : $network->label(),
            'reason' => 'Automated test ban.',
        ];
    }
}
