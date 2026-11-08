import type { ReactNode } from 'react';

const TONES = {
    neutral: 'mon:border-border mon:bg-muted mon:text-muted-foreground',
    success: 'mon:border-success/25 mon:bg-success/10 mon:text-success',
    warning: 'mon:border-warning/25 mon:bg-warning/10 mon:text-warning',
    danger: 'mon:border-destructive/25 mon:bg-destructive/10 mon:text-destructive',
};

/** Styled like the panel's node status badge. */
export default function Pill({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
    return (
        <span className={`mon:inline-flex mon:items-center mon:gap-1.5 mon:whitespace-nowrap mon:rounded-sm mon:border mon:px-2 mon:py-0.5 mon:text-xs mon:font-medium ${TONES[tone]}`}>
            <span aria-hidden className='mon:h-1.5 mon:w-1.5 mon:rounded-full mon:bg-current' />
            {children}
        </span>
    );
}
