import { useQuery } from '@tanstack/react-query';
import { PanelLink, Table } from '@pterodactyl/sdk';
import { getIncidents, keys } from '../api';
import Pill from '../components/Pill';
import Screen from '../components/Screen';
import Section from '../components/Section';
import Tiles from '../components/Tiles';
import { formatAgo, formatCount, formatPercent, plural } from '../lib/format';
import { useWindowed } from '../lib/useWindowed';

export default function IncidentsScreen() {
    const window = useWindowed(undefined, '7d');
    const result = useQuery({ queryKey: keys.incidents(window.key), queryFn: () => getIncidents(window.query), staleTime: 30_000 });

    return (
        <Screen
            title='Incidents'
            help='What the monitoring extension decided, read here rather than decided here. Monitoring evaluates the thresholds, opens and resolves the alerts and knows how to notify somebody; a second alerting system in analytics would only mean two sets of rules that can disagree about the same sample.'
            result={result}
            range={window.label}
            onRange={window.setLabel}
            period={result.data?.range}
            health={result.data?.health}
            actions={
                <PanelLink destination={{ extension: 'monitoring', screen: 'admin' }} className='trx:text-sm trx:text-muted-foreground trx:hover:text-foreground'>
                    Rules and channels
                </PanelLink>
            }
        >
            {(data) => (
                <div className='trx:space-y-8'>
                    <Tiles
                        tiles={[
                            {
                                label: 'Open incidents',
                                value: formatCount(data.counts.open),
                                hint: data.counts.open > 0 ? 'acknowledge them where they were raised' : 'nothing is breaching a threshold',
                                tone: data.counts.open > 0 ? 'bad' : 'good',
                            },
                            { label: 'Resolved', value: formatCount(data.counts.resolved), hint: 'since the oldest stored alert' },
                            { label: 'Servers affected', value: formatCount(data.counts.servers), hint: 'in the whole alert history, not this window' },
                            {
                                label: 'Fleet in the window',
                                value: formatPercent(data.context.fleet.cpu),
                                hint: `${formatCount(data.context.requests)} requests, ${formatCount(data.context.errors_5xx)} failures`,
                            },
                        ]}
                    />

                    <Section title='Recent incidents' note='Incidents are never written here. Acknowledging, resolving and configuring notifications happens on the monitoring screen, and this page reads the same records it writes.'>
                        <Table
                            rows={data.incidents}
                            keyOf={(row) => String(row.id)}
                            emptyState='No incident has ever been raised, which is the best this page can say.'
                            columns={[
                                {
                                    id: 'subject',
                                    label: 'Subject',
                                    cell: (row) => (
                                        <div className='trx:flex trx:flex-col trx:gap-1'>
                                            <span className='trx:font-medium trx:text-foreground'>{row.server?.name ?? row.node ?? 'the panel itself'}</span>
                                            <span className='trx:text-xs trx:text-muted-foreground'>{row.global ? 'a rule for every server' : row.rule}</span>
                                        </div>
                                    ),
                                },
                                { id: 'metric', label: 'Metric', cell: (row) => row.metric },
                                { id: 'value', label: 'At', cell: (row) => `${row.value} (peak ${row.peak})` },
                                { id: 'started', label: 'Started', cell: (row) => formatAgo(row.started_at) },
                                {
                                    id: 'state',
                                    label: 'State',
                                    cell: (row) =>
                                        row.resolved_at ? (
                                            <Pill tone='success'>resolved {formatAgo(row.resolved_at)}</Pill>
                                        ) : row.acknowledged_at ? (
                                            <Pill tone='warning'>acknowledged</Pill>
                                        ) : (
                                            <Pill tone='danger'>open</Pill>
                                        ),
                                },
                            ]}
                        />
                    </Section>

                    <Section title='Rules as they stand' note={plural(data.rules.length, 'threshold rule') + ' — set on the monitoring screen; analytics only reads them.'}>
                        <Table
                            rows={data.rules}
                            keyOf={(row) => String(row.id)}
                            emptyState='No rules are configured, so nothing can raise an incident.'
                            columns={[
                                { id: 'description', label: 'Rule', cell: (row) => row.description },
                                { id: 'metric', label: 'Metric', cell: (row) => row.metric },
                                { id: 'threshold', label: 'Threshold', cell: (row) => row.threshold },
                                { id: 'minutes', label: 'Minutes', cell: (row) => plural(row.minutes, 'minute') },
                                { id: 'enabled', label: 'Enabled', cell: (row) => (row.enabled ? <Pill tone='success'>on</Pill> : <Pill>off</Pill>) },
                            ]}
                        />
                    </Section>
                </div>
            )}
        </Screen>
    );
}
