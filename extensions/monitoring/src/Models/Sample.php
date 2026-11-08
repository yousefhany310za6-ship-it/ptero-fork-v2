<?php

declare(strict_types=1);

namespace Monitoring\Models;

use Illuminate\Database\Eloquent\Model;
use Monitoring\Support\State;

/**
 * @property int $server_id
 * @property \Carbon\CarbonImmutable $sampled_at
 * @property int $state
 * @property float $cpu
 * @property int $memory MiB
 * @property int $disk MiB
 * @property int $rx
 * @property int $tx
 */
final class Sample extends Model
{
    public $timestamps = false;

    protected $table = 'ext_monitoring_samples';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['sampled_at' => 'immutable_datetime', 'state' => 'integer', 'cpu' => 'float', 'memory' => 'integer', 'disk' => 'integer', 'rx' => 'integer', 'tx' => 'integer'];
    }

    public function isRunning(): bool
    {
        return $this->state === State::RUNNING;
    }
}
