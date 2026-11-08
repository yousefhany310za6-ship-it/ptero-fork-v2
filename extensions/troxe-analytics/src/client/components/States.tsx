import { Button, Spinner, httpErrorToHuman } from '@pterodactyl/sdk';
/** Blocks in the shape of what is coming, so the page does not jump when the figures land. */
export function Loading({ rows = 5 }: { rows?: number }) {
    return (
        <div className='trx:space-y-4' role='status' aria-label='Loading'>
            <div className='trx:grid trx:grid-cols-2 trx:gap-3 trx:lg:grid-cols-4'>
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} className='trx:h-[86px] trx:animate-pulse trx:rounded-sm trx:bg-card' />
                ))}
            </div>
            <div className='trx:h-[220px] trx:animate-pulse trx:rounded-sm trx:bg-popover' />
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className='trx:h-10 trx:animate-pulse trx:rounded-sm trx:bg-popover/70' />
            ))}
            <Spinner centered size={Spinner.Size.LARGE} />
        </div>
    );
}

/**
 * A screen that could not be read. The message is the panel's own translation of the HTTP error,
 * and the button is the only action offered: analytics never retries on its own against a
 * database it may be adding load to.
 */
export function Failed({ error, retry }: { error: unknown; retry?: () => void }) {
    return (
        <div className='trx:rounded-sm trx:border trx:border-destructive/30 trx:bg-popover trx:p-6'>
            <h2 className='trx:font-header trx:text-lg trx:font-medium trx:text-foreground'>These figures could not be read</h2>
            <p className='trx:mt-1 trx:text-sm trx:text-muted-foreground'>{httpErrorToHuman(error)}</p>
            {retry && (
                <Button className='trx:mt-4' size='small' onClick={retry}>
                    Try again
                </Button>
            )}
        </div>
    );
}

/** Where a window holds nothing, said as a fact rather than drawn as a row of zeros. */
export function Nothing({ children }: { children: string }) {
    return (
        <div className='trx:rounded-sm trx:border trx:border-dashed trx:border-border trx:bg-popover/50 trx:px-4 trx:py-6 trx:text-center trx:text-sm trx:text-muted-foreground'>{children}</div>
    );
}
