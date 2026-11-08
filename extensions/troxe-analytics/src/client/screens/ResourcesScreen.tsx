import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getResources, keys, type Band } from '../api';
import Bar from '../components/Bar';
import Choices from '../components/Choices';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { formatCount, formatMiB, formatPercent } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

export default function ResourcesScreen() {
    const [node, setNode] = useState(0);
    const window = useWindowed({ node: node || undefined }, '24h');
    const result = useQuery({ queryKey: keys.resources(window.key), queryFn: () => getResources(window.query), staleTime: 30_000 });

    return (
        <Screen
            title='Resources'
            help='What was sold against what was used. The limits are the panel’s own records and the usage is stored samples, so this page is where the two meet: a server that was sold 8 GiB and never used 1 GiB is a different business decision from one that runs at its limit all day.'
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
                            { label: 'Servers with history', value: formatCount(data.servers.length), hint: 'in this window, out of ' + formatCount(data.totals.servers_total) },
                            { label: 'Memory sold', value: formatMiB(data.totals.memory_allocated), hint: `${(data.totals.cpu_allocated / 100).toFixed(1)} cores of CPU promised` },
                            { label: 'Disk sold', value: formatMiB(data.totals.disk_allocated), hint: `${formatCount(data.totals.allocations_used)} of ${formatCount(data.totals.allocations_total)} addresses in use` },
                            { label: 'Accounts', value: formatCount(data.totals.users_total), hint: `${formatCount(data.totals.users_admin)} with administrator access` },
                        ]}
                    />

                    <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-4'>
                        <Choices
                            label='Node'
                            value={String(node)}
                            options={[{ value: '0', label: 'All nodes' }, ...data.nodes.map((item) => ({ value: String(item.id), label: item.name }))]}
                            onChange={(value) => setNode(Number(value))}
                        />
                    </div>

                    <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-3'>
                        <Bands title='Processor use' bands={data.distribution.cpu} note='percent of the CPU each server was sold' />
                        <Bands title='Memory use' bands={data.distribution.memory} note='percent of the memory each server was sold' />
                        <Bands title='Disk use' bands={data.distribution.disk} note='percent of the disk each server was sold' />
                    </div>

                    <Section title='Every server in the window' note='A bar is usage against the limit that was sold; an empty bar means the machine was never sampled, not that it was idle. Servers sold no limit for a resource are counted as unknown rather than as full.'>
                        <Table
                            rows={data.servers}
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
                                { id: 'memory', label: 'Memory', cell: (row) => <Bar label='' used={row.memory} limit={row.memory_limit} format={formatMiB} /> },
                                { id: 'disk', label: 'Disk', cell: (row) => <Bar label='' used={row.disk} limit={row.disk_limit} format={formatMiB} /> },
                            ]}
                        />
                    </Section>
                </div>
            )}
        </Screen>
    );
}

/**
 * How many servers sit in each band of their own limit. The widest band sets the scale, because a
 * fleet that is uniformly idle should not look like an empty chart.
 */
function Bands({ title, bands, note }: { title: string; bands: Band[]; note: string }) {
    const total = bands.reduce((sum, band) => sum + band.servers, 0);
    const widest = Math.max(1, ...bands.map((band) => band.servers));

    return (
        <div className='trx:min-w-0 trx:rounded-sm trx:border trx:border-border/40 trx:bg-card trx:p-5'>
            <h3 className='trx:font-header trx:text-base trx:font-medium trx:text-foreground'>{title}</h3>
            <p className='trx:mt-0.5 trx:text-xs trx:text-muted-foreground'>{note}</p>
            <ul className='trx:mt-4 trx:space-y-2'>
                {bands.map((band) => (
                    <li key={band.band} className='trx:flex trx:items-center trx:gap-3'>
                        <span className='trx:w-28 trx:shrink-0 trx:truncate trx:text-xs trx:text-muted-foreground' title={band.band}>
                            {band.band}
                        </span>
                        <span className='trx:h-3 trx:min-w-0 trx:flex-1 trx:overflow-hidden trx:rounded-sm trx:bg-sunken'>
                            <span
                                className={`trx:block trx:h-full trx:rounded-sm ${band.band === 'over 100%' ? 'trx:bg-destructive' : band.band === 'no limit recorded' ? 'trx:bg-muted-foreground/50' : 'trx:bg-chart-1'}`}
                                style={{ width: `${(band.servers / widest) * 100}%` }}
                            />
                        </span>
                        <span className='trx:w-14 trx:shrink-0 trx:text-right trx:text-xs trx:text-foreground'>
                            {formatCount(band.servers)}
                            {total > 0 && <span className='trx:ml-1 trx:text-muted-foreground'>{Math.round((band.servers / total) * 100)}%</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
