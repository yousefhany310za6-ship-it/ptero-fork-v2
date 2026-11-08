import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getStatus, keys, type JobRecord, type StatusReport } from '../api';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { formatAgo, formatCount, formatMiB } from '../lib/format';

/** The jobs the scheduler runs, in the order they appear on it. */
const JOB_LABELS: Record<string, string> = {
    nodes: 'Node sample',
    http: 'Access log',
    security: 'Activity counts',
    rollup: 'History rollups',
    snapshot: 'Daily census',
    prune: 'Retention',
};

export default function StatusScreen() {
    const result = useQuery({ queryKey: keys.status, queryFn: getStatus, staleTime: 30_000 });

    return (
        <Screen
            title='Collection'
            help='Whether analytics is running, what it read the last time it ran, and how much it has kept. Every toggle that changes any of this lives in the extension’s own settings on the panel, which is also where the switch that stops all of it is.'
            result={result}
            actions={
                <PanelLink destination={{ to: '/panel/extensions' }} className='trx:text-sm trx:text-muted-foreground trx:hover:text-foreground'>
                    Extension settings
                </PanelLink>
            }
        >
            {(data) => (
                <div className='trx:space-y-8'>
                    <Tiles
                        tiles={[
                            {
                                label: 'Collecting',
                                value: data.collecting ? 'yes' : 'no',
                                hint: data.missing.length ? `${formatCount(data.missing.length)} tables not created yet` : 'every table this extension needs exists',
                                tone: data.collecting ? 'good' : 'bad',
                            },
                            {
                                label: 'Pressure',
                                value: data.pressure.level ?? 'never measured',
                                hint: data.pressure.reasons.length ? data.pressure.reasons.join('; ') : 'a pass may read its full budget',
                                tone: data.pressure.level === 'paused' ? 'bad' : data.pressure.level === 'reduced' ? 'warn' : undefined,
                            },
                            {
                                label: 'Rows stored',
                                value: formatCount(data.stored.reduce((sum, row) => sum + row.rows, 0)),
                                hint: data.stored.length ? `across ${formatCount(data.stored.length)} tiers` : 'nothing stored yet',
                            },
                            {
                                label: 'Samples available',
                                value: data.sources.samples.present ? formatCount(data.sources.samples.rows) : 'monitoring table missing',
                                hint: data.sources.samples.raw_horizon_seconds === null ? 'no raw horizon' : `${formatCount(Math.round(data.sources.samples.raw_horizon_seconds / 3600))} h of minute detail`,
                            },
                        ]}
                    />

                    <Section title='Where the figures come from' note='Named so a number on another page can be traced to something that was actually measured, and so a figure that cannot be measured is said to be impossible rather than shown as zero.'>
                        <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:lg:grid-cols-2'>
                            <div className='trx:rounded-sm trx:border trx:border-border/40 trx:bg-card trx:p-5'>
                                <h3 className='trx:font-header trx:text-base trx:font-medium trx:text-foreground'>Sources</h3>
                                <ul className='trx:mt-3 trx:space-y-2 trx:text-sm'>
                                    <Line label='Monitoring samples'>{data.sources.samples.present ? `${formatCount(data.sources.samples.rows)} rows` : 'the table does not exist'}</Line>
                                    <Line label='Access log'>{data.sources.access_log.readable ? `${formatMiB(Math.round(data.sources.access_log.bytes / 1048576))} readable` : 'not readable'} · {data.sources.access_log.path}</Line>
                                    <Line label='Activity log'>{formatCount(data.sources.activity_log)} rows</Line>
                                </ul>
                            </div>
                            <div className='trx:rounded-sm trx:border trx:border-border/40 trx:bg-card trx:p-5'>
                                <h3 className='trx:font-header trx:text-base trx:font-medium trx:text-foreground'>What is not measurable</h3>
                                <ul className='trx:mt-3 trx:space-y-2 trx:text-sm'>
                                    {data.sources.notes.map((note) => (
                                        <li key={note} className='trx:min-w-0 trx:text-muted-foreground'>
                                            {note}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </Section>

                    <div className='trx:grid trx:grid-cols-1 trx:gap-8 trx:xl:grid-cols-2'>
                        <Section title='Last run of each job' note='What the worker said when it finished, including how much it read and why it stopped. A job that never ran has no row, which is different from a job that ran and did nothing.'>
                            <Table
                                rows={Object.entries(data.jobs).map(([job, record]) => ({ job, ...record }))}
                                keyOf={(row) => row.job}
                                emptyState='No job has reported yet.'
                                columns={[
                                    { id: 'job', label: 'Job', cell: (row) => JOB_LABELS[row.job] ?? row.job },
                                    { id: 'at', label: 'When', cell: (row) => (row.at ? formatAgo(String(row.at)) : 'unknown') },
                                    { id: 'seconds', label: 'Seconds', cell: (row) => (typeof row.seconds === 'number' ? row.seconds.toFixed(3) : '—') },
                                    { id: 'level', label: 'Pressure', cell: (row) => (row.level ? <Pill tone={row.level === 'paused' ? 'danger' : row.level === 'reduced' ? 'warning' : 'success'}>{String(row.level)}</Pill> : '—') },
                                    { id: 'detail', label: 'Result', cell: (row) => <Detail row={row} /> },
                                ]}
                            />
                        </Section>

                        <Section title='Stored history' note='Each tier the extension has kept, how many rows it holds, and the oldest and newest bucket in it. A tier that has been pruned to nothing is not offered as a window on any other page.'>
                            <Table
                                rows={data.stored}
                                keyOf={(row) => `${row.table}/${row.tier ?? '-'}`}
                                emptyState='Nothing is stored yet.'
                                columns={[
                                    { id: 'table', label: 'Table', cell: (row) => <span className='trx:text-xs'>{row.table.replace('ext_analytics_', '')}</span> },
                                    { id: 'tier', label: 'Tier', cell: (row) => row.tier ?? '—' },
                                    { id: 'rows', label: 'Rows', cell: (row) => formatCount(row.rows) },
                                    { id: 'oldest', label: 'Oldest', cell: (row) => (row.oldest ? row.oldest.slice(0, 16) : '—') },
                                    { id: 'newest', label: 'Newest', cell: (row) => (row.newest ? row.newest.slice(0, 16) : '—') },
                                ]}
                            />
                        </Section>
                    </div>

                    <div className='trx:grid trx:grid-cols-1 trx:gap-8 trx:xl:grid-cols-2'>
                        <Section title='Cursors' note='Where each incremental job stopped. A cursor is the reason a pass can read a few thousand rows and still be caught up an hour later: whatever it did not reach is picked up next time rather than lost.'>
                            <Table
                                rows={Object.entries(data.cursors).map(([key, value]) => ({ key, value: value === null ? 'unset' : String(value) }))}
                                keyOf={(row) => row.key}
                                emptyState='No state table yet.'
                                columns={[
                                    { id: 'key', label: 'Cursor', cell: (row) => row.key },
                                    { id: 'value', label: 'At', cell: (row) => <span className='trx:text-xs'>{row.value}</span> },
                                ]}
                            />
                        </Section>

                        <Section title='Limits it is working under' note='The settings that bound collection, as they stand right now. A ceiling on rows per pass is a ceiling on work per run, not on total work; the pressure level is what makes a pass stop early when the machine wants its CPU back.'>
                            <Configuration data={data} />
                        </Section>
                    </div>

                    {data.missing.length > 0 && (
                        <p className='trx:text-sm trx:text-warning'>
                            These tables do not exist yet: {data.missing.join(', ')}. The extension creates them when it is enabled, so an administrator who sees this list after enabling it is
                            looking at a migration that failed, and the panel’s log will say why.
                        </p>
                    )}
                </div>
            )}
        </Screen>
    );
}

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
    <li className='trx:flex trx:flex-wrap trx:items-baseline trx:justify-between trx:gap-2'>
        <span className='trx:text-muted-foreground'>{label}</span>
        <span className='trx:min-w-0 trx:text-right trx:text-foreground'>{children}</span>
    </li>
);

/** The job’s own numbers: whatever it reported beyond the four fields every job reports. */
const Detail = ({ row }: { row: JobRecord & { job: string } }) => {
    const extra = Object.entries(row).filter(([key, value]) => !['job', 'at', 'seconds', 'level', 'stopped'].includes(key) && (typeof value === 'number' || typeof value === 'string'));

    return (
        <span className='trx:text-xs trx:text-muted-foreground'>
            {row.stopped ? `stopped: ${row.stopped}` : 'complete'}
            {extra.length > 0 && ` · ${extra.map(([key, value]) => `${key} ${String(value)}`).join(', ')}`}
        </span>
    );
};

function Configuration({ data }: { data: StatusReport }) {
    const settings = [
        ['Node history', data.configuration.nodes],
        ['Panel requests', data.configuration.http],
        ['Activity counts', data.configuration.security],
    ] as const;

    return (
        <ul className='trx:space-y-2 trx:text-sm'>
            {settings.map(([label, on]) => (
                <li key={label} className='trx:flex trx:items-center trx:justify-between trx:gap-3'>
                    <span className='trx:text-muted-foreground'>{label}</span>
                    <Pill tone={on ? 'success' : 'neutral'}>{on ? 'on' : 'off'}</Pill>
                </li>
            ))}
            {Object.entries(data.configuration.limits).map(([key, value]) => (
                <li key={key} className='trx:flex trx:items-center trx:justify-between trx:gap-3'>
                    <span className='trx:text-muted-foreground'>{key.replaceAll('_', ' ')}</span>
                    <span className='trx:text-foreground'>{formatCount(value)}</span>
                </li>
            ))}
            {Object.entries(data.configuration.retention).map(([key, value]) => (
                <li key={key} className='trx:flex trx:items-center trx:justify-between trx:gap-3'>
                    <span className='trx:text-muted-foreground'>{key.replaceAll('_', ' ')}</span>
                    <span className='trx:text-foreground'>{value} days</span>
                </li>
            ))}
        </ul>
    );
}
