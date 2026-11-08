<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Node history at three tiers: `minute` (from the panel's own machine, one cron pass),
 * `hour` and `day` (rolled up from the tier above).
 *
 * A nullable usage column means "this node's usage is not visible from here", never zero.
 * Remote nodes report no usage at all through Wings, only totals and allocation.
 * `reachable` is null while nothing has been heard from the node, which is not the same
 * claim as the node having refused.
 *
 * @property int $node_id
 * @property CarbonImmutable $bucket
 * @property string $resolution
 * @property int $samples
 * @property int $servers
 * @property int $running
 * @property float|null $cpu_pct
 * @property float|null $load1
 * @property float|null $load5
 * @property float|null $load15
 * @property int|null $memory_used
 * @property int|null $memory_total
 * @property int|null $disk_used
 * @property int|null $disk_total
 * @property int $memory_allocated
 * @property int $disk_allocated
 * @property int $cpu_allocated
 * @property bool|null $reachable
 */
final class NodeSeries extends Model
{
    public const string MINUTE = 'minute';

    public const string HOUR = 'hour';

    public const string DAY = 'day';

    public $timestamps = false;

    public const string TABLE = 'ext_analytics_node_series';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'bucket' => 'immutable_datetime',
            'samples' => 'integer',
            'servers' => 'integer',
            'running' => 'integer',
            'cpu_pct' => 'float',
            'load1' => 'float',
            'load5' => 'float',
            'load15' => 'float',
            'memory_used' => 'integer',
            'memory_total' => 'integer',
            'disk_used' => 'integer',
            'disk_total' => 'integer',
            'memory_allocated' => 'integer',
            'disk_allocated' => 'integer',
            'cpu_allocated' => 'integer',
            'reachable' => 'boolean',
        ];
    }
}
