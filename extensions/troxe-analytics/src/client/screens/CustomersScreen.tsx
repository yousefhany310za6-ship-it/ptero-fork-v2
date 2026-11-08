import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getCustomers, keys } from '../api';
import MetricChart, { COLOURS } from '../components/MetricChart';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { formatCount, formatMiB, formatPercent } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

/** A census day is a date, and the chart wants a second. */
const toSeconds = (bucket: string): number => Math.floor(new Date(bucket).getTime() / 1000);

export default function CustomersScreen() {
    const window = useWindowed(undefined, '30d');
    const result = useQuery({ queryKey: keys.customers(window.key), queryFn: () => getCustomers(window.query), staleTime: 60_000 });

    return (
        <Screen
            title='Customers'
            help='The fleet as a business: who holds how much of it, and how that has moved. Servers and accounts are hard-deleted from the panel, so the only history of them is the census taken once a day — which is why this page is worth a month and not an hour.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
            rangeInfo='drawn from the daily census'
        >
            {(data) => {
                const twoFactor = data.now.users_total > 0 ? (data.now.users_2fa / data.now.users_total) * 100 : null;

                return (
                    <div className='trx:space-y-8'>
                        <Tiles
                            tiles={[
                                { label: 'Accounts', value: formatCount(data.now.users_total), hint: `${formatCount(data.now.users_admin)} with administrator access` },
                                {
                                    label: 'Accounts using 2FA',
                                    value: formatPercent(twoFactor),
                                    hint: `${formatCount(data.now.users_2fa)} of ${formatCount(data.now.users_total)}`,
                                    tone: twoFactor !== null && twoFactor < 50 ? 'warn' : undefined,
                                },
                                {
                                    label: 'Servers',
                                    value: formatCount(data.now.servers_total),
                                    hint: `${formatCount(data.now.servers_suspended)} suspended, ${formatCount(data.now.servers_installing)} installing`,
                                },
                                {
                                    label: 'Addresses in use',
                                    value: `${formatCount(data.now.allocations_used)} / ${formatCount(data.now.allocations_total)}`,
                                    hint: 'running out of these is what stops a server being created',
                                    tone: data.now.allocations_total > 0 && data.now.allocations_used / data.now.allocations_total > 0.9 ? 'warn' : undefined,
                                },
                            ]}
                        />

                        <div className='trx:grid trx:grid-cols-1 trx:gap-4 trx:xl:grid-cols-2'>
                            <MetricChart
                                title='Servers'
                                info='one point per census day'
                                rows={data.series}
                                times={(row) => toSeconds(row.bucket)}
                                lines={[
                                    { key: 'total', label: 'held', color: COLOURS.servers, value: (row) => row.servers_total },
                                    { key: 'active', label: 'running at census time', color: COLOURS.running, value: (row) => row.servers_active },
                                ]}
                                format={formatCount}
                            />
                            <MetricChart
                                title='Movement'
                                info='what the panel recorded that day, which nothing else keeps'
                                rows={data.series}
                                times={(row) => toSeconds(row.bucket)}
                                lines={[
                                    { key: 'created', label: 'created', color: COLOURS.cpu, value: (row) => row.servers_created },
                                    { key: 'deleted', label: 'deleted', color: COLOURS.errors, value: (row) => row.servers_deleted },
                                ]}
                                format={formatCount}
                            />
                        </div>

                        <MetricChart
                            title='What has been sold'
                            info='the sum of every server’s limits on that day, so a chart of capacity is a chart of promises'
                            rows={data.series}
                            times={(row) => toSeconds(row.bucket)}
                            lines={[
                                { key: 'memory', label: 'memory', color: COLOURS.memory, value: (row) => row.memory_allocated },
                                { key: 'disk', label: 'disk', color: COLOURS.disk, value: (row) => row.disk_allocated },
                            ]}
                            format={formatMiB}
                        />

                        <Section
                            title='Who holds the most'
                            note='Named by login and nothing more: an email address, a phone number and a password hash are the panel’s business, not a metrics endpoint’s.'
                        >
                            <Table
                                rows={data.accounts}
                                keyOf={(row) => String(row.user_id)}
                                emptyState='The panel has no accounts.'
                                columns={[
                                    {
                                        id: 'username',
                                        label: 'Account',
                                        cell: (row) => (
                                            <PanelLink destination={{ to: '/panel/users/$id', params: { id: String(row.user_id) } }} className='trx:font-medium trx:text-foreground trx:hover:underline'>
                                                {row.username}
                                            </PanelLink>
                                        ),
                                    },
                                    { id: 'servers', label: 'Servers', cell: (row) => formatCount(row.servers) },
                                    { id: 'memory', label: 'Memory held', cell: (row) => formatMiB(row.memory) },
                                    { id: 'disk', label: 'Disk held', cell: (row) => formatMiB(row.disk) },
                                    { id: 'cpu', label: 'CPU held', cell: (row) => `${(row.cpu / 100).toFixed(1)} cores` },
                                ]}
                            />
                        </Section>
                    </div>
                );
            }}
        </Screen>
    );
}
