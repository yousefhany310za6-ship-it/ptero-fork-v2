<?php

declare(strict_types=1);

namespace TroxeAnalytics\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * Incremental cursors and small pieces of durable analytics state.
 *
 * @property string $key
 * @property string $value
 * @property CarbonImmutable|null $updated_at
 */
final class State extends Model
{
    public const string ACTIVITY_CURSOR = 'activity_cursor_id';

    public const string NGINX_INODE = 'nginx_inode';

    public const string NGINX_OFFSET = 'nginx_offset';

    public const string ROLLUP_HOUR = 'rollup_hour';

    public const string ROLLUP_DAY = 'rollup_day';

    public const string ROLLUP_NODE_HOUR = 'rollup_node_hour';

    public const string ROLLUP_NODE_DAY = 'rollup_node_day';

    public const string ROLLUP_HTTP_HOUR = 'rollup_http_hour';

    public const string ROLLUP_HTTP_DAY = 'rollup_http_day';

    public const string LAST_PASS = 'last_pass_at';

    /** What each job did the last time it ran, so the settings screen can say so. */
    public const string LAST_RESULTS = 'last_results';

    public const string LAST_PRESSURE = 'last_pressure';

    public $timestamps = false;

    public const string TABLE = 'ext_analytics_state';

    protected $table = self::TABLE;

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['updated_at' => 'immutable_datetime'];
    }

    public static function read(string $key): ?string
    {
        return static::query()->where('key', $key)->value('value');
    }

    public static function readInt(string $key, int $default = 0): int
    {
        $value = static::read($key);

        return $value === null || ! is_numeric($value) ? $default : (int) $value;
    }

    /** @return array<string, mixed> */
    public static function readJson(string $key): array
    {
        $value = static::read($key);
        $decoded = $value === null ? null : json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    public static function write(string $key, string $value): void
    {
        static::query()->updateOrCreate(
            ['key' => $key],
            ['value' => $value, 'updated_at' => CarbonImmutable::now()],
        );
    }

    /** @param array<string, mixed> $value */
    public static function writeJson(string $key, array $value): void
    {
        static::write($key, (string) json_encode($value));
    }
}
