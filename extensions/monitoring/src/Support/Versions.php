<?php

declare(strict_types=1);

namespace Monitoring\Support;

final class Versions
{
    /**
     * Short database name and version, e.g. "MariaDB 11.4.7" for "11.4.7-MariaDB-0ubuntu0.25.04.1".
     */
    public static function database(string $version, string $driver): string
    {
        if (preg_match('/(\d+\.\d+(?:\.\d+)?)-MariaDB/i', $version, $match)) {
            return "MariaDB {$match[1]}";
        }

        if (preg_match('/^PostgreSQL (\d+(?:\.\d+)*)/i', $version, $match)) {
            return "PostgreSQL {$match[1]}";
        }

        $name = match ($driver) {
            'mariadb' => 'MariaDB',
            'pgsql' => 'PostgreSQL',
            'sqlite' => 'SQLite',
            default => 'MySQL',
        };

        return preg_match('/^(\d+\.\d+(?:\.\d+)?)/', mb_trim($version), $match) ? "{$name} {$match[1]}" : mb_substr(mb_trim($version), 0, 32);
    }
}
