<?php

declare(strict_types=1);

namespace Monitoring\Support;

/**
 * Decides whether the panel runs on a node's machine. Host usage outside Pterodactyl is only shown then,
 * so every rule errs on the side of "no".
 */
final class Machine
{
    /** Two sizes of the same thing may differ by this share and still count as equal. */
    public const float TOLERANCE = 0.01;

    public static function similar(?int $a, ?int $b): bool
    {
        return $a !== null && $b !== null && $a > 0 && $b > 0 && abs($a - $b) <= max($a, $b) * self::TOLERANCE;
    }

    /**
     * Same total memory within 1 % and, when both sides report them, the same kernel and thread count. Containers share
     * the host's kernel and see its memory and CPUs, so this holds for a panel in Docker too.
     *
     * @param  array{memory: int|null, kernel: string|null, threads: int|null}  $node  What Wings reports, memory in bytes.
     * @param  array{memory: int|null, kernel: string|null, threads: int|null}  $panel  What the panel's machine reports.
     */
    public static function sameHardware(array $node, array $panel): bool
    {
        return self::similar($node['memory'], $panel['memory'])
            && self::equalWhenKnown($node['kernel'], $panel['kernel'])
            && self::equalWhenKnown($node['threads'], $panel['threads']);
    }

    /**
     * One of the node's addresses is loopback or one of the panel machine's own addresses.
     *
     * @param  list<string>  $nodeAddresses
     * @param  list<string>  $localAddresses
     */
    public static function pointsHere(array $nodeAddresses, array $localAddresses): bool
    {
        $local = array_filter(array_map(self::normalise(...), $localAddresses));

        foreach ($nodeAddresses as $address) {
            $address = self::normalise($address);

            if ($address !== null && (self::isLoopback($address) || in_array($address, $local, true))) {
                return true;
            }
        }

        return false;
    }

    /**
     * IDs of the nodes on the panel's machine: the only node with the same hardware or, when several have it,
     * those whose address points to this machine.
     *
     * @param  list<int>  $sameHardware
     * @param  list<int>  $pointingHere  Only looked at when several nodes have the same hardware.
     * @return list<int>
     */
    public static function panelNodes(array $sameHardware, array $pointingHere): array
    {
        return count($sameHardware) <= 1 ? array_values($sameHardware) : array_values(array_intersect($sameHardware, $pointingHere));
    }

    /**
     * The panel sees the node's disk when the node's data directory exists here, or when the panel's own disk has the size
     * the node was set up with.
     */
    public static function sameDisk(bool $dataDirectoryVisible, ?int $panelDiskMib, int $configuredMib): bool
    {
        return $dataDirectoryVisible || self::similar($panelDiskMib, $configuredMib);
    }

    private static function equalWhenKnown(int|string|null $a, int|string|null $b): bool
    {
        [$a, $b] = [is_string($a) ? mb_trim($a) : $a, is_string($b) ? mb_trim($b) : $b];

        return $a === null || $a === '' || $b === null || $b === '' || $a === $b;
    }

    private static function isLoopback(string $address): bool
    {
        return $address === '::1' || str_starts_with($address, '127.') || str_starts_with($address, '::ffff:127.');
    }

    private static function normalise(string $address): ?string
    {
        $packed = @inet_pton(mb_trim($address, " \t\n\r\0\x0B[]"));

        return $packed === false ? null : (string) inet_ntop($packed);
    }
}
