import type { ReactNode } from 'react';

/** Same frame as the console's CPU and memory graphs. */
export default function ChartBlock({ title, legend, children }: { title: string; legend?: ReactNode; children: ReactNode }) {
    return (
        <div className='mon:group mon:relative mon:rounded-sm mon:border-b-4 mon:border-border mon:bg-popover mon:pt-2 mon:shadow-lg'>
            <div className='mon:flex mon:items-center mon:justify-between mon:gap-3 mon:px-4 mon:py-2'>
                <h3 className='mon:font-header mon:font-medium mon:transition-colors mon:duration-100 mon:group-hover:text-foreground'>{title}</h3>
                {legend && <div className='mon:flex mon:items-center mon:gap-3 mon:text-sm mon:text-muted-foreground'>{legend}</div>}
            </div>
            <div className='mon:ml-2 mon:pb-2'>{children}</div>
        </div>
    );
}
