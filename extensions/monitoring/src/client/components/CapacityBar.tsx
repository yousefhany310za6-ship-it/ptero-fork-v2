import { Fragment } from 'react';
import { NamedIcon } from '@pterodactyl/sdk';
import type { Capacity, SegmentKey } from '../api';
import { SEGMENT_LABELS, allocationText, compactAllocationParts, describeSegments, warningText } from '../lib/capacity';
import { formatMiB } from '../lib/format';

const COLOURS: Record<SegmentKey, string> = {
    servers: 'mon:bg-chart-1',
    other: 'mon:bg-muted-foreground/60',
    free: 'mon:bg-sunken mon:ring-1 mon:ring-inset mon:ring-border',
    unused: 'mon:bg-sunken mon:ring-1 mon:ring-inset mon:ring-border',
};

export function Swatch({ segment }: { segment: SegmentKey }) {
    return <span aria-hidden className={`mon:inline-block mon:h-2.5 mon:w-2.5 mon:shrink-0 mon:rounded-[2px] ${COLOURS[segment]}`} />;
}

/** Servers, everything else on the machine and what is left, stacked on one track. Free space is the track itself. */
export function StackedBar({ label, capacity, className = '' }: { label: string; capacity: Capacity; className?: string }) {
    const filled = capacity.segments.filter((segment) => (segment.key === 'servers' || segment.key === 'other') && segment.mib > 0);

    return (
        <div role='img' aria-label={describeSegments(label, capacity)} className={`mon:flex mon:h-2 mon:w-full mon:gap-0.5 mon:overflow-hidden mon:rounded-sm mon:bg-sunken ${className}`}>
            {filled.map((segment) => (
                <div
                    key={segment.key}
                    data-segment={segment.key}
                    title={`${SEGMENT_LABELS[segment.key]}: ${formatMiB(segment.mib)} (${segment.percent}%)`}
                    className={`mon:h-full mon:min-w-0.5 mon:shrink-0 ${COLOURS[segment.key]}`}
                    style={{ width: `${segment.percent}%` }}
                />
            ))}
        </div>
    );
}

function Legend({ capacity }: { capacity: Capacity }) {
    return (
        <ul className='mon:mt-2 mon:flex mon:flex-wrap mon:gap-x-3 mon:gap-y-1 mon:text-xs mon:text-muted-foreground'>
            {capacity.segments.map((segment) => (
                <li key={segment.key} className='mon:flex mon:items-center mon:gap-1.5 mon:whitespace-nowrap'>
                    <Swatch segment={segment.key} />
                    {SEGMENT_LABELS[segment.key]}
                    <span className='mon:text-foreground'>{formatMiB(segment.mib)}</span>
                </li>
            ))}
        </ul>
    );
}

function Warning({ capacity }: { capacity: Capacity }) {
    const text = warningText(capacity);

    return text ? (
        <p className='mon:mt-1 mon:flex mon:items-start mon:gap-1.5 mon:text-xs mon:text-warning'>
            <NamedIcon name='triangle-alert' aria-hidden className='mon:mt-px mon:h-3.5 mon:w-3.5 mon:shrink-0' />
            <span className='mon:min-w-0'>{text}</span>
        </p>
    ) : null;
}

/** One resource of a node: stacked usage, a legend with values and the allocation line. */
export default function CapacityBar({ label, capacity }: { label: string; capacity: Capacity }) {
    return (
        <div className='mon:min-w-0'>
            <div className='mon:mb-1.5 mon:flex mon:items-baseline mon:justify-between mon:gap-3 mon:text-sm'>
                <span className='mon:font-medium mon:text-foreground'>{label}</span>
                <span className='mon:truncate mon:text-xs mon:text-muted-foreground'>{formatMiB(capacity.total)} total</span>
            </div>
            <StackedBar label={label} capacity={capacity} />
            <Legend capacity={capacity} />
            <p className={`mon:mt-2 mon:text-xs mon:leading-relaxed ${capacity.warnings.length ? 'mon:text-warning' : 'mon:text-muted-foreground'}`}>{allocationText(capacity)}</p>
            <Warning capacity={capacity} />
        </div>
    );
}

/** The overview widget's short form: label, how much is allocated and left, and the bar. The numbers wrap between their parts when narrow. */
export function CompactCapacity({ label, capacity }: { label: string; capacity: Capacity }) {
    const warning = warningText(capacity);

    return (
        <div className='mon:min-w-0' title={[describeSegments(label, capacity), allocationText(capacity), warning].filter(Boolean).join('\n')}>
            <div className='mon:flex mon:flex-wrap mon:items-baseline mon:justify-between mon:gap-x-2 mon:text-xs'>
                <span className='mon:text-muted-foreground'>{label}</span>
                <span className={`mon:flex mon:min-w-0 mon:items-center mon:gap-1 ${warning ? 'mon:text-warning' : 'mon:text-foreground'}`}>
                    {warning && <NamedIcon name='triangle-alert' aria-label={warning} className='mon:h-3 mon:w-3 mon:shrink-0' />}
                    <span className='mon:min-w-0'>
                        {compactAllocationParts(capacity).map((part, index) => (
                            <Fragment key={part}>
                                {index > 0 && ' · '}
                                <span className='mon:whitespace-nowrap'>{part}</span>
                            </Fragment>
                        ))}
                    </span>
                </span>
            </div>
            <StackedBar label={label} capacity={capacity} className='mon:mt-1' />
        </div>
    );
}
