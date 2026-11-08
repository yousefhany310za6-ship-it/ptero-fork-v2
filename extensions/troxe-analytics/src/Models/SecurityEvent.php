<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Hourly counts of the panel's own activity events. `activity_logs` already records
 * every one of these; this table only outlives the 90-day pruning of that table.
 *
 * @property CarbonImmutable $bucket
 * @property string $event
 * @property int $occurrences
 */
final class SecurityEvent extends Model
{
    public $timestamps = false;

    public const string TABLE = 'ext_analytics_security_events';

    protected $table = self::TABLE;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['bucket' => 'immutable_datetime', 'occurrences' => 'integer'];
    }
}
