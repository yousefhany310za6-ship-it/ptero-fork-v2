<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Request counts per normalised route per hour. Ids, UUIDs and numeric segments are
 * folded away before storage, so the row count tracks the size of the API surface
 * rather than the number of objects on the panel.
 *
 * @property CarbonImmutable $bucket
 * @property string $route
 * @property int $requests
 * @property int $errors
 */
final class HttpRoute extends Model
{
    public $timestamps = false;

    public const string TABLE = 'ext_analytics_http_routes';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['bucket' => 'immutable_datetime', 'requests' => 'integer', 'errors' => 'integer'];
    }
}
