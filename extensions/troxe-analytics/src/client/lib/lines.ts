import type { NodePoint, Point } from '../api';
import { COLOURS, type Line } from '../components/MetricChart';

/**
 * The lines every history chart draws, defined once so a fleet CPU chart and a single server's
 * CPU chart mean the same thing in the same colours on two different screens.
 */
export const cpuLines: Line<Point>[] = [
    { key: 'cpu', label: 'mean', color: COLOURS.cpu, value: (point) => point.cpu },
    { key: 'cpu_peak', label: 'peak', color: COLOURS.cpuPeak, value: (point) => point.cpu_peak },
];

export const memoryLines: Line<Point>[] = [
    { key: 'memory', label: 'mean', color: COLOURS.memory, value: (point) => point.memory },
    { key: 'memory_peak', label: 'peak', color: COLOURS.memoryPeak, value: (point) => point.memory_peak },
];

export const diskLines: Line<Point>[] = [{ key: 'disk', label: 'peak', color: COLOURS.disk, value: (point) => point.disk ?? null }];

/** Both are bytes per second: a bucket's counter movement divided by the seconds in the bucket. */
export const trafficLines: Line<Point>[] = [
    { key: 'rx', label: 'in', color: COLOURS.rx, value: (point) => point.rx },
    { key: 'tx', label: 'out', color: COLOURS.tx, value: (point) => point.tx },
];

export const serverLines: Line<Point>[] = [
    { key: 'servers', label: 'servers with samples', color: COLOURS.servers, value: (point) => point.servers ?? null },
];

/** Percent of every core on the machine, from its own /proc — not a sum of container limits. */
export const nodeCpuLines: Line<NodePoint>[] = [{ key: 'cpu', label: 'cpu', color: COLOURS.cpu, value: (point) => point.cpu }];

/** A load average is a count of runnable work, not a percentage, so it gets its own chart. */
export const nodeLoadLines: Line<NodePoint>[] = [{ key: 'load1', label: '1 min load', color: COLOURS.load, value: (point) => point.load1 }];

export const nodeMemoryLines: Line<NodePoint>[] = [
    { key: 'memory_used', label: 'used', color: COLOURS.memory, value: (point) => point.memory_used },
    { key: 'memory_allocated', label: 'sold', color: COLOURS.allocated, value: (point) => point.memory_allocated },
    { key: 'memory_total', label: 'capacity', color: COLOURS.disk, value: (point) => point.memory_total },
];

export const nodeDiskLines: Line<NodePoint>[] = [
    { key: 'disk_used', label: 'used', color: COLOURS.memory, value: (point) => point.disk_used },
    { key: 'disk_allocated', label: 'sold', color: COLOURS.allocated, value: (point) => point.disk_allocated },
    { key: 'disk_total', label: 'capacity', color: COLOURS.disk, value: (point) => point.disk_total },
];
