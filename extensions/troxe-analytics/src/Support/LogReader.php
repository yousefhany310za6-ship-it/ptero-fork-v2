<?php

declare(strict_types=1);

namespace TroxeAnalytics\Support;

/**
 * Reads the panel's nginx access log forward from a stored byte offset.
 *
 * The log is the only place request counts and status codes exist that the panel does
 * not already have to be instrumented for, and tailing it from a worker keeps that
 * instrumentation out of the request path entirely. What it cannot give is timing: this
 * install logs the combined format, which carries no $request_time, so no latency figure
 * is ever derived from it.
 *
 * A partial trailing line is left unconsumed rather than guessed at, so a request that
 * is still being written is counted on the next pass instead of miscounted now.
 */
final class LogReader
{
    /** Combined format: address ident user [time] "METHOD path proto" status size "ref" "ua". */
    private const string LINE = '~^(?<address>\S+) \S+ \S+ \[(?<time>[^\]]+)\] "(?:(?<method>[A-Z]{3,10}) (?<path>\S+)(?: [^"]*)?|(?<badrequest>[^"]*))" (?<status>\d{3}) (?<size>\d+|-)~';

    /** Bytes read at a time; the file is never loaded whole. */
    private const int CHUNK = 1048576;

    private const int MAX_LINE = 8192;

    /**
     * @return array{entries: list<array{time: int, address: string, method: string, path: string, status: int}>, inode: int, offset: int}
     */
    public function read(string $path, int $inode, int $offset, int $maxBytes): array
    {
        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return ['entries' => [], 'inode' => $inode, 'offset' => $offset];
        }

        try {
            $stat = fstat($handle);
            $currentInode = (int) ($stat['ino'] ?? 0);
            $size = (int) ($stat['size'] ?? 0);

            // A rotated file is a different inode, and a truncated one is shorter than where
            // we stopped. Either way the stored offset describes a file that no longer exists.
            if ($currentInode !== $inode || $size < $offset) {
                $offset = 0;
            }

            if ($offset > 0 && fseek($handle, $offset) !== 0) {
                return ['entries' => [], 'inode' => $currentInode, 'offset' => $offset];
            }

            $entries = [];
            $pending = '';
            $position = $offset;
            $read = 0;

            while ($read < $maxBytes && ($chunk = fread($handle, self::CHUNK)) !== false && $chunk !== '') {
                $read += strlen($chunk);
                $position += strlen($chunk);
                $lines = explode("\n", $pending.$chunk);
                $pending = array_pop($lines) ?? '';

                foreach ($lines as $line) {
                    $entry = self::parse($line);

                    if ($entry !== null) {
                        $entries[] = $entry;
                    }
                }
            }

            // Only complete lines are consumed; a newline that arrived mid-chunk stays unread.
            if ($pending !== '' && strlen($pending) <= self::MAX_LINE) {
                $position -= strlen($pending);
            }

            return ['entries' => $entries, 'inode' => $currentInode, 'offset' => $position];
        } finally {
            fclose($handle);
        }
    }

    /** @return array{time: int, address: string, method: string, path: string, status: int}|null */
    private static function parse(string $line): ?array
    {
        if ($line === '' || ! preg_match(self::LINE, $line, $matches, PREG_NO_ERROR)) {
            return null;
        }

        $time = \DateTimeImmutable::createFromFormat('d/M/Y:H:i:s O', $matches['time']);

        if ($time === false) {
            return null;
        }

        return [
            'time' => $time->getTimestamp(),
            'address' => $matches['address'],
            'method' => $matches['method'] ?? '-',
            'path' => $matches['path'] ?? '-',
            'status' => (int) $matches['status'],
        ];
    }
}
