import { formatShare } from '../lib/format';

interface Props {
    label: string;
    /** What is in use, or null when nothing was measured: a bar with no figure in it is a lie. */
    used: number | null;
    /** What the panel has sold or earmarked against the same resource, when that is known. */
    allocated?: number | null;
    limit: number;
    format: (value: number) => string;
}

/**
 * One resource against its limit. The fill is what is used; the tick is what has been allocated.
 * A fill past the tick is what it looks like — usage beyond what was promised, which happens when
 * the panel is overcommitted.
 */
export default function Bar({ label, used, allocated, limit, format }: Props) {
    const share = limit > 0 && used !== null ? Math.min(100, (used / limit) * 100) : null;
    const tick = limit > 0 && allocated !== null && allocated !== undefined ? Math.min(100, (allocated / limit) * 100) : null;
    const colour = share === null ? '' : share >= 90 ? 'trx:bg-destructive' : share >= 75 ? 'trx:bg-warning' : 'trx:bg-success';

    return (
        <div className='trx:min-w-0'>
            <div className='trx:mb-1 trx:flex trx:items-baseline trx:justify-between trx:gap-3 trx:text-xs'>
                <span className='trx:truncate trx:text-muted-foreground'>{label}</span>
                <span className='trx:whitespace-nowrap trx:text-foreground'>{used === null ? 'unknown' : `${format(used)} / ${format(limit)}`}</span>
            </div>
            <div
                className='trx:relative trx:h-2 trx:w-full trx:overflow-hidden trx:rounded-sm trx:bg-sunken'
                role='meter'
                aria-label={label}
                aria-valuenow={share === null ? undefined : Math.round(share)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={used === null ? 'unknown' : `${format(used)} of ${format(limit)}, ${formatShare(used, limit)} used`}
            >
                {share !== null && <div className={`trx:h-full trx:rounded-sm ${colour}`} style={{ width: `${share}%` }} />}
                {tick !== null && <span aria-hidden className='trx:absolute trx:top-0 trx:h-full trx:w-0.5 trx:bg-foreground/60' style={{ left: `calc(${tick}% - 1px)` }} />}
            </div>
            {tick !== null && (
                <p className='trx:mt-1 trx:text-xs trx:text-muted-foreground'>
                    {allocated! > limit && <span className='trx:text-warning'>over-allocated: </span>}
                    {format(allocated!)} allocated, {formatShare(allocated!, limit)} of the limit
                </p>
            )}
        </div>
    );
}
