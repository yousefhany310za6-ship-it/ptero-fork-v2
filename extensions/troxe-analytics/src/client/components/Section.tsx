import type { ReactNode } from 'react';

interface Props {
    title: string;
    note?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
}

/** A titled block of the page: what it is, one line about how to read it, then the content. */
export default function Section({ title, note, actions, children }: Props) {
    return (
        <section className='trx:min-w-0'>
            <div className='trx:mb-3 trx:flex trx:flex-wrap trx:items-baseline trx:justify-between trx:gap-3'>
                <h2 className='trx:font-header trx:text-lg trx:font-medium trx:text-foreground'>{title}</h2>
                {actions && <div className='trx:flex trx:items-center trx:gap-2'>{actions}</div>}
            </div>
            {note && <p className='trx:mb-3 trx:max-w-4xl trx:text-xs trx:leading-relaxed trx:text-muted-foreground'>{note}</p>}
            {children}
        </section>
    );
}
