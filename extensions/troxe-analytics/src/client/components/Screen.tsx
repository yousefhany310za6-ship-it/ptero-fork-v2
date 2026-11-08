import type { ReactNode } from 'react';
import { PageContentBlock } from '@pterodactyl/sdk';
import type { Health, Period, RangeLabel } from '../api';
import HealthBanner from './HealthBanner';
import RangePicker from './RangePicker';
import { Failed, Loading } from './States';

interface Props<T> {
    title: string;
    help: string;
    /** The query this screen is built on, taken as the shape it has rather than as a library type. */
    result: { data: T | undefined; error: unknown; isError: boolean; isLoading: boolean; refetch: () => void };
    /** Absent on a page with no window to choose, such as the collection report. */
    range?: RangeLabel;
    onRange?: (label: RangeLabel) => void;
    period?: Period;
    health?: Health;
    actions?: ReactNode;
    rangeInfo?: string;
    children: (data: T) => ReactNode;
}

/**
 * The frame every analytics screen shares: what the page is, the window it is drawn over, whether
 * that window is being kept up to date, and then the figures.
 *
 * A screen that is still loading shows its shape rather than nothing, and a screen that failed
 * says why in one sentence with one button. Neither state is allowed to look like a fleet at zero.
 */
export default function Screen<T>({ title, help, result, range, onRange, period, health, actions, rangeInfo, children }: Props<T>) {
    return (
        <PageContentBlock title={title}>
            <header className='trx:mb-5'>
                <div className='trx:flex trx:flex-wrap trx:items-start trx:justify-between trx:gap-4'>
                    <div className='trx:min-w-0'>
                        <h1 className='trx:font-header trx:text-2xl trx:font-semibold trx:text-foreground'>{title}</h1>
                        <p className='trx:mt-1 trx:max-w-4xl trx:text-sm trx:leading-relaxed trx:text-foreground/70'>{help}</p>
                    </div>
                    {actions && <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-2'>{actions}</div>}
                </div>
            </header>
            {range && onRange && <RangePicker period={period} value={range} onChange={onRange} info={rangeInfo} />}
            {!result.data ? (
                result.isError ? <Failed error={result.error} retry={() => result.refetch()} /> : <Loading />
            ) : (
                <>
                    {health && <HealthBanner health={health} />}
                    {children(result.data)}
                </>
            )}
        </PageContentBlock>
    );
}
