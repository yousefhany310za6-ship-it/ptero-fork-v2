import type { ReactNode } from 'react';

export interface Tile {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone?: 'good' | 'warn' | 'bad';
}

const TONE = { good: 'trx:text-success', warn: 'trx:text-warning', bad: 'trx:text-destructive' };

/** Headline figures for a screen: value first, and the reason it is that colour one line below. */
export default function Tiles({ tiles }: { tiles: Tile[] }) {
    return (
        <div className='trx:mb-6 trx:grid trx:grid-cols-2 trx:gap-3 trx:lg:grid-cols-4'>
            {tiles.map((tile) => (
                <div key={tile.label} className='trx:min-w-0 trx:rounded-sm trx:border trx:border-border/40 trx:bg-card trx:p-5'>
                    <p className='trx:truncate trx:text-sm trx:text-muted-foreground' title={tile.label}>
                        {tile.label}
                    </p>
                    <p className={`trx:mt-1 trx:truncate trx:font-header trx:text-2xl trx:font-semibold ${tile.tone ? TONE[tile.tone] : 'trx:text-foreground'}`}>{tile.value}</p>
                    {tile.hint && <p className='trx:mt-1 trx:truncate trx:text-xs trx:text-muted-foreground'>{tile.hint}</p>}
                </div>
            ))}
        </div>
    );
}
