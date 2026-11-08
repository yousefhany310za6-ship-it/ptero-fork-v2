import type { ReactNode } from 'react';

/** Same frame as the console's CPU and memory graphs. */
export default function ChartBlock({ title, info, actions, legend, children }: { title: string; info?: ReactNode; actions?: ReactNode; legend?: ReactNode; children: ReactNode }) {
    return (
        <div className='trx:group trx:relative trx:min-w-0 trx:rounded-sm trx:border-b-4 trx:border-border trx:bg-popover trx:pt-2 trx:shadow-lg'>
            <div className='trx:flex trx:items-center trx:justify-between trx:gap-3 trx:px-4 trx:py-2'>
                <div className='trx:min-w-0'>
                    <h3 className='trx:font-header trx:font-medium trx:transition-colors trx:duration-100 trx:group-hover:text-foreground'>{title}</h3>
                    {info && <p className='trx:mt-0.5 trx:truncate trx:text-xs trx:text-muted-foreground'>{info}</p>}
                </div>
                {actions && <div className='trx:flex trx:shrink-0 trx:items-center trx:gap-3 trx:text-sm trx:text-muted-foreground'>{actions}</div>}
            </div>
            {legend && (
                <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-x-4 trx:gap-y-1.5 trx:px-4 trx:pb-1 trx:text-xs trx:text-muted-foreground'>
                    {legend}
                </div>
            )}
            <div className='trx:ml-2 trx:pb-2'>{children}</div>
        </div>
    );
}

/** A colour chip and its name, for a chart legend. */
export function Swatch({ color, label }: { color: string; label: string }) {
    return (
        <span className='trx:flex trx:items-center trx:gap-1.5 trx:whitespace-nowrap'>
            <span aria-hidden className='trx:inline-block trx:h-2.5 trx:w-2.5 trx:shrink-0 trx:rounded-[2px]' style={{ background: color }} />
            {label}
        </span>
    );
}
