<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Downsampled per-server history. The minute tier lives in the monitoring extension's
 * `ext_monitoring_samples`; this table holds `hour` and `day`.
 *
 * @property int $server_id
 * @property int|null $node_id
 * @property CarbonImmutable $bucket
 * @property string $resolution
 * @property int $samples
 * @property int $running_samples
 * @property int $restarts
 * @property float $cpu_avg
 * @property float $cpu_max
 * @property float $cpu_std
 * @property int $memory_avg
 * @property int $memory_max
 * @property int $memory_std
 * @property int $disk_max
 * @property int $rx_bytes
 * @property int $tx_bytes
 */
final class ServerSeries extends Model
{
    public const string HOUR = 'hour';

    public const string DAY = 'day';

    public $timestamps = false;

    public const string TABLE = 'ext_analytics_server_series';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'bucket' => 'immutable_datetime',
            'cpu_avg' => 'float',
            'cpu_max' => 'float',
            'cpu_std' => 'float',
            'memory_avg' => 'integer',
            'memory_max' => 'integer',
            'memory_std' => 'integer',
            'disk_max' => 'integer',
            'samples' => 'integer',
            'running_samples' => 'integer',
            'restarts' => 'integer',
            'rx_bytes' => 'integer',
            'tx_bytes' => 'integer',
        ];
    }
}
