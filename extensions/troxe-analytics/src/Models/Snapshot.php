<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Daily census of panel objects. Sizes are the limits servers were sold, in MiB, and CPU as
 * the sum of their percent-of-one-thread limits — allocation, not usage. `servers_active`
 * counts servers a sample was running for that day, which is the one running figure the
 * panel records nowhere once the moment has passed.
 *
 * @property CarbonImmutable $bucket
 * @property int $users_total
 * @property int $users_admin
 * @property int $users_2fa
 * @property int $servers_total
 * @property int $servers_suspended
 * @property int $servers_installing
 * @property int $servers_active
 * @property int $nodes_total
 * @property int $allocations_total
 * @property int $allocations_used
 * @property int $memory_allocated
 * @property int $disk_allocated
 * @property int $cpu_allocated
 * @property int $servers_created
 * @property int $servers_deleted
 * @property int $users_created
 */
final class Snapshot extends Model
{
    public $timestamps = false;

    public const string TABLE = 'ext_analytics_snapshots_daily';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'bucket' => 'immutable_date',
            'users_total' => 'integer',
            'users_admin' => 'integer',
            'users_2fa' => 'integer',
            'servers_total' => 'integer',
            'servers_suspended' => 'integer',
            'servers_installing' => 'integer',
            'servers_active' => 'integer',
            'nodes_total' => 'integer',
            'allocations_total' => 'integer',
            'allocations_used' => 'integer',
            'memory_allocated' => 'integer',
            'disk_allocated' => 'integer',
            'cpu_allocated' => 'integer',
            'servers_created' => 'integer',
            'servers_deleted' => 'integer',
            'users_created' => 'integer',
        ];
    }
}
