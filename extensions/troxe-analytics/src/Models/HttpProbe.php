<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property CarbonImmutable $bucket
 * @property string $address
 * @property int $requests
 * @property int $rejected
 * @property string $sample_path
 */
final class HttpProbe extends Model
{
    public $timestamps = false;

    public const string TABLE = 'ext_analytics_http_probes';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['bucket' => 'immutable_datetime', 'requests' => 'integer', 'rejected' => 'integer'];
    }
}
