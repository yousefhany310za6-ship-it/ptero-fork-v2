import type { Capacity, CpuCapacity, SegmentKey } from '../api';
import { formatMiB, formatMiBPair, plural } from './format';

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
    servers: 'Servers',
    other: 'Everything else',
    free: 'Free',
    unused: 'Not used by servers',
};

export const HOST_UNKNOWN = 'Host usage outside Pterodactyl is only known for the node the panel runs on.';

/** "Memory: Servers 56 GiB (44.8%), Everything else 40 GiB (31.8%), Free 29 GiB (23.4%) of 125 GiB" */
export function describeSegments(label: string, capacity: Capacity): string {
    const parts = capacity.segments.map((segment) => `${SEGMENT_LABELS[segment.key]} ${formatMiB(segment.mib)} (${segment.percent}%)`);

    return `${label}: ${parts.join(', ')} of ${formatMiB(capacity.total)}`;
}

/** "Allocated 350 GiB of 768 GiB allowed (500% overallocation) · 418 GiB left to allocate" */
export function allocationText(capacity: Capacity): string {
    const parts = [
        `Allocated ${formatMiB(capacity.allocated)} of ${formatMiB(capacity.allowed)} allowed${capacity.overallocate > 0 ? ` (${capacity.overallocate}% overallocation)` : ''}`,
        capacity.left >= 0 ? `${formatMiB(capacity.left)} left to allocate` : `${formatMiB(-capacity.left)} over the limit`,
    ];

    if (capacity.unlimited > 0) {
        parts.push(`${plural(capacity.unlimited, 'server')} without a limit`);
    }

    return parts.join(' · ');
}

/** ["350 / 768 GiB allocated", "418 GiB left"] */
export function compactAllocationParts(capacity: Capacity): string[] {
    return [`${formatMiBPair(capacity.allocated, capacity.allowed)} allocated`, capacity.left >= 0 ? `${formatMiB(capacity.left)} left` : `${formatMiB(-capacity.left)} over`];
}

export function warningText(capacity: Capacity): string | null {
    const reasons: string[] = [];

    if (capacity.warnings.includes('physical')) {
        reasons.push(`Allocated more than the node has (${formatMiB(capacity.total)})`);
    }

    if (capacity.warnings.includes('low')) {
        reasons.push(capacity.left < 0 ? 'Over what the node allows' : 'Less than 10% left to allocate');
    }

    return reasons.length ? reasons.join(' · ') : null;
}

const threads = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/** "Servers use 2.3 of 16 threads · 24 threads allocated · 3 servers without a limit" */
export function cpuText(cpu: CpuCapacity): string {
    const parts = [cpu.threads ? `Servers use ${threads(cpu.used)} of ${plural(cpu.threads, 'thread')}` : `Servers use ${threads(cpu.used)} threads`, `${threads(cpu.allocated)} ${cpu.allocated === 1 ? 'thread' : 'threads'} allocated`];

    if (cpu.unlimited > 0) {
        parts.push(`${plural(cpu.unlimited, 'server')} without a limit`);
    }

    return parts.join(' · ');
}
