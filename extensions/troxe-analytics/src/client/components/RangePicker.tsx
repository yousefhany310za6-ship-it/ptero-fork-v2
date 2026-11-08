import { Button } from '@pterodactyl/sdk';
import type { Period, RangeLabel } from '../api';
import { describePeriod, rangeWords } from '../lib/range';

interface Props {
    /** What the server drew the window at; absent on a page that asks for a file rather than a chart. */
    period?: Period;
    value: RangeLabel;
    onChange: (label: RangeLabel) => void;
    /** Used until a period arrives, or instead of one on a page that has no figures to describe. */
    offered?: readonly RangeLabel[];
    info?: string;
}

/**
 * The time window, and — said plainly beside it — the resolution the server actually drew it at.
 * Asking for 24 hours and getting one point per ten minutes is worth knowing, because that is what
 * a spike looks like.
 */
export default function RangePicker({ period, value, onChange, offered, info }: Props) {
    const windows = period?.windows ?? offered ?? [];

    return (
        <div className='trx:mb-5 trx:flex trx:flex-col trx:gap-2 trx:md:flex-row trx:md:items-center trx:md:justify-between'>
            <p className='trx:min-w-0 trx:text-xs trx:text-muted-foreground'>
                {period && describePeriod(period)}
                {info && <span className={period ? 'trx:ml-2' : ''}>{info}</span>}
            </p>
            <div className='trx:flex trx:flex-wrap trx:gap-1' role='group' aria-label='Time window'>
                {windows.map((label) =>
                    label === value ? (
                        <Button key={label} size='small' aria-pressed>
                            {rangeWords(label)}
                        </Button>
                    ) : (
                        <Button.Text key={label} size='small' onClick={() => onChange(label)}>
                            {rangeWords(label)}
                        </Button.Text>
                    ),
                )}
            </div>
        </div>
    );
}
