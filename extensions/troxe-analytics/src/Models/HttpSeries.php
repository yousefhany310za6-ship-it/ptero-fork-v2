<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Panel request volume and error mix per bucket, from the nginx access log.
 *
 * Minute rows come straight off the log; hour and day rows are sums of the tier below.
 *
 * @property CarbonImmutable $bucket
 * @property string $resolution
 * @property int $requests
 * @property int $errors_4xx
 * @property int $errors_5xx
 */
final class HttpSeries extends Model
{
    public const string MINUTE = 'minute';

    public const string HOUR = 'hour';

    public const string DAY = 'day';

    public $timestamps = false;

    public const string TABLE = 'ext_analytics_http_series';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'bucket' => 'immutable_datetime',
            'requests' => 'integer',
            'errors_4xx' => 'integer',
            'errors_5xx' => 'integer',
        ];
    }
}
