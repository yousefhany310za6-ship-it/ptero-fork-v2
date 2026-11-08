import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getOverview, keys, type Overview } from '../api';
import MetricChart, { COLOURS } from '../components/MetricChart';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { cpuLines, memoryLines } from '../lib/lines';
import { formatCount, formatMiB, formatPercent, plural } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

export default function OverviewScreen() {
    const window = useWindowed(undefined, '24h');
    const result = useQuery({ queryKey: keys.overview(window.key), queryFn: () => getOverview(window.query), staleTime: 30_000 });

    return (
        <Screen
            title='Analytics'
            help='The fleet over a window of stored history. Nothing here is measured while a customer is asking for a page: every figure was collected by a scheduled worker and folded into these buckets before this request arrived.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
            actions={
                <PanelLink destination={{ extension: 'troxe-analytics', screen: 'status' }} className='trx:text-sm trx:text-muted-foreground trx:hover:text-foreground'>
                    Is it collecting?
                </PanelLink>
            }
        >
            {(data) => <Figures data={data} />}
        </Screen>
    );
}

function Figures({ data }: { data: Overview }) {
    const { fleet, http, census, incidents, live } = data;
    const errors = http.requests > 0 ? ((http.errors_4xx + http.errors_5xx) / http.requests) * 100 : null;

    const tiles = [
        {
            label: 'Servers running',
            value: live ? `${live.running} / ${live.total}` : 'unknown',
            hint: live ? `${formatCount(census.servers_suspended)} of ${formatCount(census.servers_total)} suspended` : 'the monitoring worker has not reported yet',
        },
        {
            label: 'Fleet CPU',
            value: formatPercent(fleet.totals.cpu),
            hint: `peak ${formatPercent(fleet.totals.cpu_peak)} over ${plural(fleet.totals.points, 'bucket')}`,
            tone: fleet.totals.cpu !== null && fleet.totals.cpu > 80 ? ('warn' as const) : undefined,
        },
        {
            label: 'Fleet memory',
            value: fleet.totals.memory === null ? 'unknown' : formatMiB(fleet.totals.memory),
            hint: `peak ${fleet.totals.memory_peak === null ? 'unknown' : formatMiB(fleet.totals.memory_peak)}`,
        },
        {
            label: 'Panel requests',
            value: formatCount(http.requests),
            hint: errors === null ? 'no requests in the window' : `${errors.toFixed(2)}% answered 4xx or 5xx`,
            tone: errors !== null && errors >= 5 ? ('bad' as const) : undefined,
        },
    ];

    return (
        <div className='trx:space-y-8'>
            <Tiles tiles={tiles} />

            <Section
                title='The fleet'
                note='A mean over what was sampled in each bucket, and the highest single sample inside it. A gap is a bucket with no samples, not a fleet that went idle.'
                actions={
                    incidents.open > 0 ? (
                        <PanelLink destination={{ extension: 'troxe-analytics', screen: 'incidents' }}>
                            <Pill tone='danger'>{plural(incidents.open, 'open incident')}</Pill>
                        </PanelLink>
                    ) : (
                        <Pill tone='success'>no open incidents</Pill>
                    )
                }
            >
                <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-2'>
                    <MetricChart
                        title='Processor'
                        info={`${plural(fleet.totals.samples, 'sample')} in ${plural(fleet.totals.points, 'bucket')}`}
                        rows={fleet.points}
                        times={(point) => point.t}
                        lines={cpuLines}
                        format={formatPercent}
                        max={100}
                    />
                    <MetricChart title='Memory' rows={fleet.points} times={(point) => point.t} lines={memoryLines} format={formatMiB} />
                </div>
            </Section>

            <Section title='The panel itself' note='Requests the panel answered, counted from its own access log. Scanner traffic is kept out of these figures and reported on the Security page.'>
                <MetricChart
                    title='Panel requests'
                    info={`${formatCount(http.errors_4xx)} client errors and ${formatCount(http.errors_5xx)} server errors in the window`}
                    rows={http.points}
                    times={(point) => point.t}
                    lines={[
                        { key: 'requests', label: 'requests', color: COLOURS.requests, value: (point) => point.requests },
                        { key: 'errors', label: 'errors', color: COLOURS.errors, value: (point) => point.errors_4xx + point.errors_5xx },
                    ]}
                    format={formatCount}
                />
            </Section>

            <div className='trx:grid trx:grid-cols-1 trx:gap-8 trx:xl:grid-cols-2'>
                <Section title='Busiest servers' note='Ranked by mean processor use in this window. A server with no samples has no row, which is not the same statement as a server at zero.'>
                    <Table
                        rows={data.busiest}
                        keyOf={(row) => String(row.server_id)}
                        emptyState='No server was sampled in this window.'
                        columns={[
                            {
                                id: 'name',
                                label: 'Server',
                                cell: (row) => (
                                    <PanelLink destination={{ to: '/panel/servers/$id/details', params: { id: String(row.server_id) } }} className='trx:font-medium trx:text-foreground trx:hover:underline'>
                                        {row.name}
                                    </PanelLink>
                                ),
                            },
                            { id: 'cpu', label: 'CPU', cell: (row) => formatPercent(row.cpu) },
                            { id: 'memory', label: 'Memory', cell: (row) => (row.memory === null ? 'unknown' : formatMiB(row.memory)) },
                            { id: 'up', label: 'Uptime', cell: (row) => (row.up === null ? 'unknown' : `${(row.up * 100).toFixed(1)}%`) },
                        ]}
                    />
                </Section>
                <Section title='What the panel logged' note='Counts of events the panel already writes to its own audit log, which analytics keeps after that log is pruned.'>
                    <Table
                        rows={data.events.totals}
                        keyOf={(row) => row.event}
                        emptyState='Nothing was logged in this window.'
                        columns={[
                            { id: 'event', label: 'Event', cell: (row) => row.event },
                            { id: 'occurrences', label: 'Times', cell: (row) => formatCount(row.occurrences) },
                        ]}
                    />
                </Section>
            </div>

            <Section title='Nodes' note='What has been sold against what each machine holds, and the last figures stored about it. Usage is measurable only on the machine the panel itself runs on; a remote node reports reach, not load.'>
                <Table
                    rows={data.nodes}
                    keyOf={(row) => String(row.id)}
                    emptyState='The panel defines no nodes.'
                    columns={[
                        {
                            id: 'name',
                            label: 'Node',
                            cell: (row) => (
                                <PanelLink destination={{ extension: 'troxe-analytics', screen: 'nodes', search: { node: String(row.id) } }} className='trx:font-medium trx:text-foreground trx:hover:underline'>
                                    {row.name}
                                </PanelLink>
                            ),
                        },
                        { id: 'servers', label: 'Servers', cell: (row) => formatCount(row.servers) },
                        { id: 'memory', label: 'Memory sold', cell: (row) => `${formatMiB(row.memory_allocated)} of ${formatMiB(row.memory_total)}` },
                        { id: 'disk', label: 'Disk sold', cell: (row) => `${formatMiB(row.disk_allocated)} of ${formatMiB(row.disk_total)}` },
                        {
                            id: 'reachable',
                            label: 'Last seen',
                            cell: (row) => (row.reachable === null ? <Pill>never sampled</Pill> : row.reachable ? <Pill tone='success'>up</Pill> : <Pill tone='danger'>down</Pill>),
                        },
                    ]}
                />
            </Section>
        </div>
    );
}
