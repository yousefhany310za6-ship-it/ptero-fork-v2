import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, PanelLink, Table, httpErrorToHuman } from '@pterodactyl/sdk';
import { getServer, getServers, keys, type RangeLabel, type ServerRow } from '../api';
import MetricChart from '../components/MetricChart';
import Choices from '../components/Choices';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { cpuLines, diskLines, memoryLines, trafficLines } from '../lib/lines';
import { formatAgo, formatBytes, formatCount, formatMiB, formatMiBPair, formatPercent, formatRate, plural } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

const SORTS = [
    { value: 'cpu', label: 'CPU' },
    { value: 'memory', label: 'memory' },
    { value: 'disk', label: 'disk' },
    { value: 'rx', label: 'received' },
    { value: 'tx', label: 'sent' },
    { value: 'restarts', label: 'restarts' },
    { value: 'uptime', label: 'uptime' },
] as const;

type Sort = (typeof SORTS)[number]['value'];

export default function ServersScreen() {
    const [node, setNode] = useState<number | 0>(0);
    const [sort, setSort] = useState<Sort>('cpu');
    const [search, setSearch] = useState('');
    const [draft, setDraft] = useState('');
    const [selected, setSelected] = useState<number | null>(null);

    const window = useWindowed({ node: node || undefined, sort, search: search || undefined }, '24h');
    const result = useQuery({ queryKey: keys.servers(window.key), queryFn: () => getServers(window.query), staleTime: 30_000 });

    return (
        <Screen
            title='Servers'
            help='One row per server that was sampled inside the window, ranked by the figure chosen below. Averages are weighted by samples, so a bucket the collector reached counts for what it holds and no more.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
        >
            {(data) => (
                <div className='trx:space-y-6'>
                    <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-4'>
                        <Choices
                            label='Rank by'
                            value={sort}
                            options={SORTS}
                            onChange={(value) => setSort(value)}
                        />
                        <Choices
                            label='Node'
                            value={String(node)}
                            options={[{ value: '0', label: 'All nodes' }, ...data.nodes.map((item) => ({ value: String(item.id), label: item.name }))]}
                            onChange={(value) => setNode(Number(value))}
                        />
                        <form
                            className='trx:flex trx:items-center trx:gap-2'
                            onSubmit={(event) => {
                                event.preventDefault();
                                setSearch(draft.trim());
                            }}
                        >
                            <Input aria-label='Filter by name' placeholder='Filter by name' value={draft} onChange={(event) => setDraft(event.target.value)} className='trx:w-48' />
                            <Button type='submit' size='xsmall'>
                                Filter
                            </Button>
                            {search && (
                                <Button.Text
                                    size='xsmall'
                                    onClick={() => {
                                        setDraft('');
                                        setSearch('');
                                    }}
                                >
                                    Clear
                                </Button.Text>
                            )}
                        </form>
                    </div>

                    <Table
                        rows={data.servers}
                        keyOf={(row) => String(row.server_id)}
                        emptyState={search ? `No server named “${search}” was sampled in this window.` : 'No server was sampled in this window.'}
                        columns={[
                            {
                                id: 'name',
                                label: 'Server',
                                cell: (row) => (
                                    <button type='button' onClick={() => setSelected(row.server_id === selected ? null : row.server_id)} className='trx:font-medium trx:text-foreground trx:hover:underline'>
                                        {row.name}
                                    </button>
                                ),
                            },
                            { id: 'cpu', label: 'CPU mean', cell: (row) => formatPercent(row.cpu) },
                            { id: 'cpu_peak', label: 'CPU peak', cell: (row) => formatPercent(row.cpu_peak) },
                            { id: 'memory', label: 'Memory', cell: (row) => (row.memory === null ? 'unknown' : formatMiBPair(row.memory, row.memory_limit)) },
                            { id: 'disk', label: 'Disk', cell: (row) => (row.disk === null ? 'unknown' : formatMiBPair(row.disk, row.disk_limit)) },
                            { id: 'traffic', label: 'Traffic', cell: (row) => `${formatBytesRow(row, 'rx_bytes')} in · ${formatBytesRow(row, 'tx_bytes')} out` },
                            { id: 'up', label: 'Uptime', cell: (row) => (row.up === null ? <Pill>not rolled up</Pill> : `${(row.up * 100).toFixed(1)}%`) },
                            { id: 'restarts', label: 'Restarts', cell: (row) => formatCount(row.restarts) },
                        ]}
                    />

                    {selected !== null && <Detail id={selected} range={window.label} onRange={window.setLabel} onClose={() => setSelected(null)} />}
                </div>
            )}
        </Screen>
    );
}

const formatBytesRow = (row: ServerRow, key: 'rx_bytes' | 'tx_bytes'): string => {
    const bytes = row[key];

    return bytes === null ? 'unknown' : formatBytes(bytes);
};

/**
 * One server's history, opened inside the list rather than on a route of its own: the list is
 * what the administrator was reading, and a chart of one server is meaningless without it.
 */
function Detail({ id, range, onRange, onClose }: { id: number; range: RangeLabel; onRange: (label: RangeLabel) => void; onClose: () => void }) {
    const result = useQuery({ queryKey: keys.server(id, range), queryFn: () => getServer(id, { range }), staleTime: 30_000 });
    const data = result.data;

    if (!data) {
        return result.isError ? <p className='trx:text-sm trx:text-destructive'>{httpErrorToHuman(result.error)}</p> : null;
    }

    const { server, totals } = data;
    const sold = (used: number | null, limit: number) => (used === null ? 'unknown' : `${formatMiBPair(used, limit)}`);

    return (
        <Section
            title={server.name}
            note={
                <>
                    {server.node ?? 'no node'} · {server.account ?? 'no account'} · created {server.created_at ? formatAgo(server.created_at) : 'unknown'} ·{' '}
                    <PanelLink destination={{ to: '/panel/servers/$id/details', params: { id: String(server.id) } }} className='trx:hover:underline'>
                        open in the admin view
                    </PanelLink>
                </>
            }
            actions={
                <>
                    <Choices label='Window' value={range} options={data.range.windows.map((label) => ({ value: label, label }))} onChange={onRange} />
                    <Button.Text size='xsmall' onClick={onClose}>
                        Close
                    </Button.Text>
                </>
            }
        >
            <div className='trx:mb-4'>
                <Tiles
                    tiles={[
                        { label: 'CPU mean', value: formatPercent(totals.cpu), hint: `peak ${formatPercent(totals.cpu_peak)} of ${server.cpu_limit}%` },
                        { label: 'Memory', value: sold(totals.memory, server.memory_limit), hint: `peak ${sold(totals.memory_peak, server.memory_limit)}` },
                        { label: 'Disk peak', value: sold(totals.disk_peak, server.disk_limit), hint: 'the highest sample in the window, not an average' },
                        { label: 'Uptime', value: totals.up === null ? 'not rolled up' : `${(totals.up * 100).toFixed(2)}%`, hint: `${plural(totals.restarts, 'restart')} in the window` },
                    ]}
                />
            </div>
            <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-2'>
                <MetricChart title='Processor' rows={data.points} times={(point) => point.t} lines={cpuLines} format={formatPercent} max={Math.max(100, server.cpu_limit)} />
                <MetricChart title='Memory' rows={data.points} times={(point) => point.t} lines={memoryLines} format={formatMiB} />
                <MetricChart title='Network' info='mean rate inside each bucket' rows={data.points} times={(point) => point.t} lines={trafficLines} format={formatRate} />
                <MetricChart title='Disk used' rows={data.points} times={(point) => point.t} lines={diskLines} format={formatMiB} />
            </div>
            {data.incidents.length > 0 && (
                <div className='trx:mt-4'>
                    <Table
                        rows={data.incidents}
                        keyOf={(row) => String(row.id)}
                        emptyState='No incidents.'
                        columns={[
                            { id: 'rule', label: 'Rule', cell: (row) => row.rule },
                            { id: 'metric', label: 'Metric', cell: (row) => row.metric },
                            { id: 'value', label: 'Value', cell: (row) => `${row.value} (peak ${row.peak})` },
                            { id: 'started', label: 'Started', cell: (row) => formatAgo(row.started_at) },
                            { id: 'resolved', label: 'Resolved', cell: (row) => (row.resolved_at ? formatAgo(row.resolved_at) : 'still open') },
                        ]}
                    />
                </div>
            )}
        </Section>
    );
}
