import { useQuery } from '@tanstack/react-query';
import { Table } from '@pterodactyl/sdk';
import { getSecurity, keys, type EventSeriesRow, type Events } from '../api';
import MetricChart, { COLOURS } from '../components/MetricChart';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { formatAgo, formatCount, formatPercent } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

const LINE_COLOURS = [COLOURS.cpu, COLOURS.memory, COLOURS.rx, COLOURS.tx, COLOURS.errors, COLOURS.load, COLOURS.cpuPeak, COLOURS.memoryPeak];

/** One line per event name, which is the only way two events on one axis stay readable. */
function pivot(events: Events): { rows: { t: number; counts: Record<string, number> }[]; names: string[] } {
    const names = [...new Set(events.series.map((row) => row.event))];
    const times = [...new Set(events.series.map((row) => row.t))].sort((a, b) => a - b);
    const lookup = new Map(events.series.map((row) => [`${row.t}|${row.event}`, row.occurrences]));

    return {
        rows: times.map((t) => ({
            t,
            counts: Object.fromEntries(names.map((name) => [name, lookup.get(`${t}|${name}`) ?? 0])),
        })),
        names,
    };
}

export default function SecurityScreen() {
    const window = useWindowed(undefined, '7d');
    const result = useQuery({ queryKey: keys.security(window.key), queryFn: () => getSecurity(window.query), staleTime: 60_000 });

    return (
        <Screen
            title='Security'
            help='Two halves, both of them counts of things that were already being written: the panel’s own audit log, and its own access log. Nothing here watches a user or a container more closely than the panel already does — what analytics adds is that these figures outlive the pruning of the logs they came from.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
        >
            {(data) => {
                const errors = data.panel_errors.requests > 0 ? ((data.panel_errors.errors_4xx + data.panel_errors.errors_5xx) / data.panel_errors.requests) * 100 : null;
                const probes = data.probes.reduce((sum, row) => sum + row.requests, 0);
                const rejected = data.probes.reduce((sum, row) => sum + row.rejected, 0);
                const chart = pivot(data.events);

                return (
                    <div className='trx:space-y-8'>
                        <Tiles
                            tiles={[
                                { label: 'Panel requests', value: formatCount(data.panel_errors.requests), hint: 'scanner traffic is counted separately, below' },
                                {
                                    label: 'Error rate',
                                    value: errors === null ? 'unknown' : `${errors.toFixed(2)}%`,
                                    hint: `${formatCount(data.panel_errors.errors_5xx)} server-side failures`,
                                    tone: errors !== null && errors >= 5 ? 'bad' : undefined,
                                },
                                {
                                    label: 'Probed addresses',
                                    value: formatCount(data.probes.length),
                                    hint: `${formatCount(probes)} requests, ${formatCount(rejected)} answered 404 or 401`,
                                    tone: probes > 0 && rejected / probes < 0.5 ? 'warn' : undefined,
                                },
                                { label: 'Logged events', value: formatCount(data.events.totals.reduce((sum, row) => sum + row.occurrences, 0)), hint: `over ${data.timeline.length} of the newest rows` },
                            ]}
                        />

                        {chart.names.length > 0 ? (
                            <MetricChart
                                title='What the panel logged'
                                info='the six most frequent event names in the window'
                                rows={chart.rows}
                                times={(row) => row.t}
                                lines={chart.names.map((name, index) => ({
                                    key: name,
                                    label: name,
                                    color: LINE_COLOURS[index % LINE_COLOURS.length],
                                    value: (row: typeof chart.rows[number]) => row.counts[name] ?? null,
                                }))}
                                format={formatCount}
                            />
                        ) : (
                            <p className='trx:text-sm trx:text-muted-foreground'>Nothing was logged in this window.</p>
                        )}

                        <div className='trx:grid trx:grid-cols-1 trx:gap-8 trx:xl:grid-cols-2'>
                            <Section title='Event totals' note='Counts by event name, not log entries: the entry itself stays in the panel’s own audit log and is pruned there on the panel’s own schedule.'>
                                <Table
                                    rows={data.events.totals}
                                    keyOf={(row) => row.event}
                                    emptyState='No events in this window.'
                                    columns={[
                                        { id: 'event', label: 'Event', cell: (row) => row.event },
                                        { id: 'occurrences', label: 'Times', cell: (row) => formatCount(row.occurrences) },
                                    ]}
                                />
                            </Section>
                            <Section
                                title='Addresses the panel was asked for'
                                note='Requests for paths that do not exist on a panel, grouped by the address that asked. A sample path is kept so an administrator can see what was actually requested; the query string is not.'
                            >
                                <Table
                                    rows={data.probes}
                                    keyOf={(row) => row.address}
                                    emptyState='Nothing was probed in this window.'
                                    columns={[
                                        { id: 'address', label: 'Address', cell: (row) => row.address },
                                        { id: 'requests', label: 'Requests', cell: (row) => formatCount(row.requests) },
                                        {
                                            id: 'rejected',
                                            label: 'Rejected',
                                            cell: (row) => <Pill tone={row.rejected === row.requests ? 'warning' : 'neutral'}>{formatPercent((row.requests > 0 ? row.rejected / row.requests : 0) * 100)}</Pill>,
                                        },
                                        { id: 'path', label: 'Example', cell: (row) => <span className='trx:block trx:max-w-64 trx:truncate trx:text-xs trx:text-muted-foreground' title={row.sample_path}>{row.sample_path}</span> },
                                    ]}
                                />
                            </Section>
                        </div>

                        <Section title='Newest activity' note='The panel’s audit log, oldest columns first: what happened, who did it and from where. The log’s `properties` column is never read — it holds whatever the actor typed, which can be a password change or a server command, and a metrics endpoint has no business carrying it.'>
                            <Table
                                rows={data.timeline}
                                keyOf={(row) => String(row.id)}
                                emptyState='The panel has logged no activity.'
                                columns={[
                                    { id: 'when', label: 'When', cell: (row) => formatAgo(row.timestamp) },
                                    { id: 'event', label: 'Event', cell: (row) => row.event },
                                    { id: 'actor', label: 'Who', cell: (row) => (row.actor_type === null ? 'the system' : `${row.actor_type} ${row.actor_id ?? ''}`) },
                                    { id: 'ip', label: 'From', cell: (row) => row.ip ?? 'local' },
                                    { id: 'description', label: 'Description', cell: (row) => <span className='trx:block trx:max-w-96 trx:truncate trx:text-xs trx:text-muted-foreground' title={row.description ?? undefined}>{row.description ?? ''}</span> },
                                ]}
                            />
                        </Section>
                    </div>
                );
            }}
        </Screen>
    );
}
