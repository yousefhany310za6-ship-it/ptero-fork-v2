import type { ReactNode } from 'react';

const TONES = {
    neutral: 'trx:border-border trx:bg-muted trx:text-muted-foreground',
    success: 'trx:border-success/25 trx:bg-success/10 trx:text-success',
    warning: 'trx:border-warning/25 trx:bg-warning/10 trx:text-warning',
    danger: 'trx:border-destructive/25 trx:bg-destructive/10 trx:text-destructive',
};

/** Styled like the panel's node status badge. */
export default function Pill({ tone = 'neutral', dot = true, children }: { tone?: keyof typeof TONES; dot?: boolean; children: ReactNode }) {
    return (
        <span className={`trx:inline-flex trx:items-center trx:gap-1.5 trx:whitespace-nowrap trx:rounded-sm trx:border trx:px-2 trx:py-0.5 trx:text-xs trx:font-medium ${TONES[tone]}`}>
            {dot && <span aria-hidden className='trx:h-1.5 trx:w-1.5 trx:rounded-full trx:bg-current' />}
            {children}
        </span>
    );
}
