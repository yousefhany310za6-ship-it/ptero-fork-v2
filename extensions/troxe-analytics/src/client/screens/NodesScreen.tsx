import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, PanelLink, Table } from '@pterodactyl/sdk';
import { getNode, getNodes, keys, type Host, type RangeLabel } from '../api';
import Bar from '../components/Bar';
import MetricChart from '../components/MetricChart';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { memoryLines, nodeCpuLines, nodeDiskLines, nodeLoadLines, nodeMemoryLines } from '../lib/lines';
import { formatAgo, formatBytes, formatCount, formatDuration, formatMiB, formatPercent, plural } from '../lib/format';
import { useSearchValue } from '../lib/useSearchValue';
import { useWindowed } from '../lib/useWindowed';

export default function NodesScreen() {
    const window = useWindowed(undefined, '24h');
    const result = useQuery({ queryKey: keys.nodes(window.key), queryFn: () => getNodes(window.query), staleTime: 30_000 });
    const requested = useSearchValue('node');
    const [selected, setSelected] = useState<number | null>(null);

    // A node chosen from another screen opens its history; after that the choice is local.
    useEffect(() => {
        const id = Number(requested);

        if (requested && Number.isInteger(id) && id > 0) {
            setSelected(id);
        }
    }, [requested]);

    return (
        <Screen
            title='Nodes'
            help='Capacity the panel has sold, and the last figures stored about each machine. Wings answers a status request with the servers it runs, not with the machine underneath them, so load and disk occupancy exist only for the node that hosts the panel itself.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
        >
            {(data) => (
                <div className='trx:space-y-8'>
                    <Tiles
                        tiles={[
                            {
                                label: 'Nodes',
                                value: formatCount(data.nodes.length),
                                hint: `${plural(data.nodes.filter((node) => node.reachable === false).length, 'node')} unreachable`,
                                tone: data.nodes.some((node) => node.reachable === false) ? 'bad' : undefined,
                            },
                            {
                                label: 'Servers',
                                value: data.live ? `${data.live.running} / ${data.live.total}` : 'unknown',
                                hint: `${formatCount(data.nodes.reduce((sum, node) => sum + node.servers, 0))} allocated`,
                            },
                            {
                                label: 'Panel host load',
                                value: hostLoad(data.panel_host),
                                hint: data.panel_host.cpus ? `${data.panel_host.cpus} cores · up ${formatDuration(data.panel_host.uptime ?? 0)}` : 'one machine only',
                            },
                            {
                                label: 'Fleet CPU',
                                value: formatPercent(fleetMean(data.fleet)),
                                hint: 'mean of every sampled server in the window',
                            },
                        ]}
                    />

                    <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-2'>
                        <MetricChart title='Fleet memory' info='what the sampled servers held' rows={data.fleet} times={(point) => point.t} lines={memoryLines} format={formatMiB} />
                        <HostBox host={data.panel_host} />
                    </div>

                    <Section title='Every node' note='Sold against capacity comes from the panel’s own records; usage comes from the machine. They are different columns on purpose, because an overcommit is a decision and not a measurement.'>
                        <Table
                            rows={data.nodes}
                            keyOf={(row) => String(row.id)}
                            emptyState='The panel defines no nodes.'
                            columns={[
                                {
                                    id: 'name',
                                    label: 'Node',
                                    cell: (row) => (
                                        <div className='trx:flex trx:flex-col trx:gap-1'>
                                            <button type='button' className='trx:font-medium trx:text-foreground trx:hover:underline' onClick={() => setSelected(row.id === selected ? null : row.id)}>
                                                {row.name}
                                            </button>
                                            <span className='trx:text-xs trx:text-muted-foreground'>{row.fqdn}</span>
                                        </div>
                                    ),
                                },
                                {
                                    id: 'servers',
                                    label: 'Servers',
                                    cell: (row) => (
                                        <div className='trx:flex trx:flex-col trx:items-start trx:gap-1'>
                                            {formatCount(row.servers)}
                                            {row.maintenance && <Pill tone='warning'>maintenance</Pill>}
                                        </div>
                                    ),
                                },
                                { id: 'cpu', label: 'CPU sold', cell: (row) => <span className='trx:whitespace-nowrap'>{formatCount(row.cpu_allocated)}%</span> },
                                { id: 'memory', label: 'Memory', cell: (row) => <Bar label='' used={row.memory_used} allocated={row.memory_allocated} limit={row.memory_total} format={formatMiB} /> },
                                { id: 'disk', label: 'Disk', cell: (row) => <Bar label='' used={row.disk_used} allocated={row.disk_allocated} limit={row.disk_total} format={formatMiB} /> },
                                {
                                    id: 'seen',
                                    label: 'Last sample',
                                    cell: (row) => (
                                        <div className='trx:flex trx:flex-col trx:gap-1'>
                                            <span className='trx:text-xs'>{row.sampled_at ? formatAgo(row.sampled_at) : 'never'}</span>
                                            {row.reachable === null ? <Pill>not sampled</Pill> : row.reachable ? <Pill tone='success'>up</Pill> : <Pill tone='danger'>down</Pill>}
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </Section>

                    {selected !== null && <NodeDetail id={selected} range={window.label} onClose={() => setSelected(null)} />}
                </div>
            )}
        </Screen>
    );
}

const hostLoad = (host: Host): string => (host.load ? host.load.map((value) => value.toFixed(2)).join(' · ') : 'unknown');

const fleetMean = (points: { cpu: number | null }[]): number | null => {
    const values = points.map((point) => point.cpu).filter((value): value is number => value !== null);

    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
};

/**
 * The machine the panel runs on, read once from its own process table by the monitoring worker.
 * This is not a node chart: it is a single reading, and a chart of one reading would be a lie
 * about resolution.
 */
function HostBox({ host }: { host: Host }) {
    const disk = host.disk.total === null ? null : host.disk.total - (host.disk.free ?? 0);

    return (
        <div className='trx:min-w-0 trx:rounded-sm trx:border trx:border-border/40 trx:bg-card trx:p-5'>
            <h3 className='trx:font-header trx:text-lg trx:font-medium trx:text-foreground'>The panel’s own machine</h3>
            <p className='trx:mt-1 trx:text-xs trx:leading-relaxed trx:text-muted-foreground'>
                {host.memory?.container ? 'Memory is shown against the container the panel runs inside, not the whole host.' : 'Read from this machine’s own /proc; no remote node is included.'}
            </p>
            <div className='trx:mt-4 trx:space-y-4'>
                <Bar label='Memory' used={host.memory?.used ?? null} limit={host.memory?.total ?? 0} format={formatBytes} />
                <Bar label='Storage' used={disk} limit={host.disk.total ?? 0} format={formatBytes} />
                <div className='trx:flex trx:items-baseline trx:justify-between trx:gap-3 trx:text-xs'>
                    <span className='trx:text-muted-foreground'>Load average</span>
                    <span className='trx:whitespace-nowrap trx:text-foreground'>
                        {hostLoad(host)}
                        {host.cpus && ` on ${host.cpus} cores`}
                    </span>
                </div>
                <div className='trx:flex trx:items-baseline trx:justify-between trx:gap-3 trx:text-xs'>
                    <span className='trx:text-muted-foreground'>Uptime</span>
                    <span className='trx:whitespace-nowrap trx:text-foreground'>{host.uptime === null ? 'unknown' : formatDuration(host.uptime)}</span>
                </div>
            </div>
        </div>
    );
}

function NodeDetail({ id, range, onClose }: { id: number; range: RangeLabel; onClose: () => void }) {
    const result = useQuery({ queryKey: keys.node(id, range), queryFn: () => getNode(id, { range }), staleTime: 30_000 });
    const data = result.data;

    if (!data) {
        return null;
    }

    const measured = data.points.some((point) => point.cpu !== null);

    return (
        <Section
            title={data.node.name}
            note={
                <>
                    {data.node.fqdn} · {plural(data.node.server_count, 'server')} · {data.node.maintenance ? 'in maintenance' : 'accepting servers'} ·{' '}
                    <PanelLink destination={{ to: '/panel/nodes/$id/settings', params: { id: String(data.node.id) } }} className='trx:hover:underline'>
                        node settings
                    </PanelLink>
                </>
            }
            actions={
                <Button.Text size='xsmall' onClick={onClose}>
                    Close
                </Button.Text>
            }
        >
            {!measured && (
                <p className='trx:mb-4 trx:text-sm trx:text-muted-foreground'>
                    Nothing has ever been stored about this machine’s own processor, load or occupancy, because the panel does not run on it. Capacity, allocation and reach are still measured
                    — those come from the panel’s records and from the servers placed here.
                </p>
            )}
            <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-2'>
                <MetricChart title='Processor' info='percent of every core on the machine' rows={data.points} times={(point) => point.t} lines={nodeCpuLines} format={formatPercent} max={100} />
                <MetricChart title='Load' info='runnable work, not a percentage' rows={data.points} times={(point) => point.t} lines={nodeLoadLines} format={(value) => value.toFixed(1)} />
                <MetricChart title='Memory' info='used, sold and the machine’s own size' rows={data.points} times={(point) => point.t} lines={nodeMemoryLines} format={formatMiB} />
                <MetricChart title='Disk' info='used, sold and the machine’s own size' rows={data.points} times={(point) => point.t} lines={nodeDiskLines} format={formatMiB} />
            </div>
            <div className='trx:mt-4'>
                <Table
                    rows={data.servers}
                    keyOf={(row) => String(row.server_id)}
                    emptyState='No server on this node was sampled in this window.'
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
                        { id: 'cpu', label: 'CPU mean', cell: (row) => formatPercent(row.cpu) },
                        { id: 'memory', label: 'Memory', cell: (row) => (row.memory === null ? 'unknown' : <Bar label='' used={row.memory} limit={row.memory_limit} format={formatMiB} />) },
                        { id: 'up', label: 'Uptime', cell: (row) => (row.up === null ? 'unknown' : `${(row.up * 100).toFixed(1)}%`) },
                    ]}
                />
            </div>
        </Section>
    );
}
