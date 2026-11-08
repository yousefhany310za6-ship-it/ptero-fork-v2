import { useState } from 'react';
import { LinkButton, PageContentBlock } from '@pterodactyl/sdk';
import { reportHref, type RangeLabel } from '../api';
import Choices from '../components/Choices';
import RangePicker from '../components/RangePicker';
import Section from '../components/Section';
import { ALL_RANGES, rangeWords } from '../lib/range';
import { useWindowed } from '../lib/useWindowed';

const KINDS = [
    { value: 'servers', label: 'Servers', note: 'One row per server that was sampled in the window, with its mean and peak figures and the limits it was sold.' },
    { value: 'nodes', label: 'Nodes', note: 'One row per node: capacity, what has been sold to it, and the last figures stored about it.' },
    { value: 'http', label: 'Panel requests', note: 'One row per bucket: requests, 4xx and 5xx. No timing figure exists in the access log, so none is exported.' },
    { value: 'routes', label: 'Top routes', note: 'The routes the panel was asked for most often, with how many of those answers were errors.' },
    { value: 'events', label: 'Logged events', note: 'Counts by event name over the window, from the panel’s own audit log.' },
    { value: 'census', label: 'Daily census', note: 'One row per day the census was taken on: accounts, servers, addresses and what had been sold.' },
];

export default function ReportsScreen() {
    const [kind, setKind] = useState('servers');
    const window = useWindowed({}, '30d');
    const selected = KINDS.find((item) => item.value === kind) ?? KINDS[0];
    const href = reportHref(kind, { range: window.label });

    return (
        <PageContentBlock title='Reports'>
            <header className='trx:mb-5'>
                <h1 className='trx:font-header trx:text-2xl trx:font-semibold trx:text-foreground'>Reports</h1>
                <p className='trx:mt-1 trx:max-w-4xl trx:text-sm trx:leading-relaxed trx:text-foreground/70'>
                    A window of stored history as a spreadsheet. An export is a bounded read of rows that already exist — the same aggregate a chart issues, with a ceiling on how many rows
                    leave the database — so it is not the kind of work that is suspended while the machine is busy.
                </p>
            </header>

            <RangePicker value={window.label} onChange={window.setLabel} offered={ALL_RANGES} info='the window is the same one every page reads' />

            <div className='trx:mb-6 trx:flex trx:flex-col trx:gap-4'>
                <Choices label='Export' value={kind} options={KINDS.map((item) => ({ value: item.value, label: item.label }))} onChange={setKind} />
                <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-4'>
                    <LinkButton href={href} size='small' color='green'>
                        Download {selected.label.toLowerCase()} as CSV
                    </LinkButton>
                    <p className='trx:min-w-0 trx:text-xs trx:text-muted-foreground'>
                        {selected.note} Over {rangeWords(window.label)} ending now.
                    </p>
                </div>
            </div>

            <Section title='What an export is not' note='A year of every server folded into one document is heavier than any request should be, so it is not offered here: it belongs in a scheduled job, and the rollups it would read are already kept. The columns arrive exactly as they are stored, which means an average is an average over samples and not over the wall clock.'>
                <ul className='trx:space-y-2 trx:text-sm trx:text-foreground/80'>
                    <li className='trx:flex trx:gap-2'>
                        <span className='trx:text-muted-foreground'>•</span>
                        <span>Averages are weighted by the samples in each bucket, so a bucket the collector reached for ten seconds counts for ten seconds.</span>
                    </li>
                    <li className='trx:flex trx:gap-2'>
                        <span className='trx:text-muted-foreground'>•</span>
                        <span>An empty cell means nothing was measured. It does not mean zero, and a spreadsheet should not be made to pretend otherwise.</span>
                    </li>
                    <li className='trx:flex trx:gap-2'>
                        <span className='trx:text-muted-foreground'>•</span>
                        <span>Values that a customer can type, such as a server name, are prefixed against formula evaluation when they begin with <code className='trx:text-foreground'>=</code>, <code className='trx:text-foreground'>+</code>, <code className='trx:text-foreground'>-</code> or <code className='trx:text-foreground'>@</code>.</span>
                    </li>
                    <li className='trx:flex trx:gap-2'>
                        <span className='trx:text-muted-foreground'>•</span>
                        <span>The file is produced behind the same administrator authentication as every other page here, including the panel’s two-factor check.</span>
                    </li>
                </ul>
            </Section>
        </PageContentBlock>
    );
}
