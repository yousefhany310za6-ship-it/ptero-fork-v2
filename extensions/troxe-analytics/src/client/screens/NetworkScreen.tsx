import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getNetwork, keys, type ServerRow } from '../api';
import Bar from '../components/Bar';
import Choices from '../components/Choices';
import MetricChart from '../components/MetricChart';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { trafficLines } from '../lib/lines';
import { formatBytes, formatCount, formatRate, plural } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

export default function NetworkScreen() {
    const [node, setNode] = useState(0);
    const window = useWindowed({ node: node || undefined }, '24h');
    const result = useQuery({ queryKey: keys.network(window.key), queryFn: () => getNetwork(window.query), staleTime: 30_000 });

    return (
        <Screen
            title='Network'
            help='Movement, counted from the container byte counters the collector already reads once a minute. No interface is sampled more often for this page, and there is no node-level figure to show: Wings reports no counters of its own.'
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
                            { label: 'Mean in', value: data.totals.rx === null ? 'unknown' : formatRate(data.totals.rx), hint: 'averaged over the buckets that had samples' },
                            { label: 'Mean out', value: data.totals.tx === null ? 'unknown' : formatRate(data.totals.tx), hint: 'a rate, not a total: six hours of 1 MB/s is not 21600 MB/s' },
                            { label: 'Servers moving traffic', value: formatCount(data.talkers.rx.filter((row) => (row.rx_bytes ?? 0) > 0).length), hint: `of ${plural(data.talkers.rx.length, 'server')} in the ranking` },
                            {
                                label: 'Addresses in use',
                                value: `${formatCount(data.addresses.reduce((sum, row) => sum + row.used, 0))} / ${formatCount(data.addresses.reduce((sum, row) => sum + row.total, 0))}`,
                                hint: 'the one figure the panel answers exactly rather than estimates',
                            },
                        ]}
                    />

                    <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-4'>
                        <Choices
                            label='Node'
                            value={String(node)}
                            options={[{ value: '0', label: 'All nodes' }, ...data.addresses.map((row) => ({ value: String(row.node_id), label: row.name }))]}
                            onChange={(value) => setNode(Number(value))}
                        />
                    </div>

                    <MetricChart
                        title='Traffic'
                        info='the counter movement inside each bucket, as a rate'
                        rows={data.points}
                        times={(point) => point.t}
                        lines={trafficLines}
                        format={formatRate}
                    />

                    <div className='trx:grid trx:grid-cols-1 trx:gap-8 trx:xl:grid-cols-2'>
                        <Talkers title='Most received' rows={data.talkers.rx} column='rx_bytes' />
                        <Talkers title='Most sent' rows={data.talkers.tx} column='tx_bytes' />
                    </div>

                    <Section title='Address space' note='Addresses the panel holds on each node and how many carry a server. This is the network figure that a hosting operation runs out of first, and it needs no sampling to know.'>
                        <Table
                            rows={data.addresses}
                            keyOf={(row) => String(row.node_id)}
                            emptyState='The panel defines no nodes.'
                            columns={[
                                {
                                    id: 'name',
                                    label: 'Node',
                                    cell: (row) => (
                                        <PanelLink destination={{ extension: 'troxe-analytics', screen: 'nodes', search: { node: String(row.node_id) } }} className='trx:font-medium trx:text-foreground trx:hover:underline'>
                                            {row.name}
                                        </PanelLink>
                                    ),
                                },
                                { id: 'used', label: 'In use', cell: (row) => <Bar label='' used={row.used} limit={row.total} format={(value) => formatCount(value)} /> },
                            ]}
                        />
                    </Section>
                </div>
            )}
        </Screen>
    );
}

/**
 * The ranking half of the page: bytes for the whole window rather than a rate, because the
 * question here is who moved the most, and that is a total.
 */
function Talkers({ title, rows, column }: { title: string; rows: ServerRow[]; column: 'rx_bytes' | 'tx_bytes' }) {
    return (
        <Section title={title} note='A counter that crosses a container restart is read as the difference of the extremes, which under-reads rather than double-counts.'>
            <Table
                rows={rows}
                keyOf={(row) => String(row.server_id)}
                emptyState='No server moved traffic in this window.'
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
                    { id: 'bytes', label: 'Bytes', cell: (row) => (row[column] === null ? 'unknown' : formatBytes(row[column]!)) },
                    { id: 'samples', label: 'Samples', cell: (row) => formatCount(row.samples) },
                ]}
            />
        </Section>
    );
}
