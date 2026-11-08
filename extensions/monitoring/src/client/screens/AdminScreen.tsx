import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageContentBlock, Spinner, Table, TitledGreyBox, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { acknowledgeAlert, deleteGlobalRule, getAdmin, keys, saveGlobalRule, type AdminMonitoring, type Health, type NodeHealth, type RuleInput } from '../api';
import AlertsTable from '../components/AlertsTable';
import NodeCapacityCard from '../components/NodeCapacityCard';
import Pill from '../components/Pill';
import RulesBox from '../components/RulesBox';
import StatTiles from '../components/StatTiles';
import UsageBar from '../components/UsageBar';
import { formatAgo, formatBytes, formatDuration } from '../lib/format';

export default function AdminScreen() {
    const queryClient = useQueryClient();
    const data = useQuery({ queryKey: keys.admin, queryFn: getAdmin, refetchInterval: 60_000 });
    const update = (result: AdminMonitoring) => queryClient.setQueryData(keys.admin, result);
    const onError = (error: unknown) => toast.error(httpErrorToHuman(error));
    const interval = data.data?.health.interval ?? 5;

    const saving = useMutation({ mutationFn: ({ input, id }: { input: RuleInput; id?: number; done: () => void }) => saveGlobalRule(input, id), onSuccess: (result, { done }) => (update(result), done()), onError });
    const removal = useMutation({ mutationFn: ({ id }: { id: number; done: () => void }) => deleteGlobalRule(id), onSuccess: (result, { done }) => (update(result), done()), onError });
    const acknowledging = useMutation({ mutationFn: acknowledgeAlert, onSuccess: update, onError });

    return (
        <PageContentBlock title='Monitoring'>
            <header className='mon:mb-6'>
                <h1 className='mon:font-header mon:text-2xl mon:font-semibold mon:text-foreground'>Monitoring</h1>
                <p className='mon:mt-1 mon:text-sm mon:leading-relaxed mon:text-foreground/70'>Health of the panel, its nodes and servers. Sampled every {interval === 1 ? 'minute' : `${interval} minutes`}.</p>
            </header>
            {!data.data ? (
                data.isError ? <p className='mon:text-sm mon:text-destructive'>{httpErrorToHuman(data.error)}</p> : <Spinner centered size={Spinner.Size.LARGE} />
            ) : (
                <>
                    <StatTiles summary={data.data.health} />
                    <div className='mon:grid mon:grid-cols-1 mon:gap-6'>
                        <section className='mon:min-w-0'>
                            <SectionTitle>Nodes</SectionTitle>
                            <NodesTable nodes={data.data.health.node_list} />
                        </section>
                        {data.data.health.node_list.length > 0 && (
                            <section className='mon:min-w-0'>
                                <SectionTitle>Capacity</SectionTitle>
                                <div className={`mon:grid mon:grid-cols-1 mon:gap-6 ${data.data.health.node_list.length > 1 ? 'mon:xl:grid-cols-2' : ''}`}>
                                    {data.data.health.node_list.map((node) => (
                                        <NodeCapacityCard key={node.id} node={node} wide={data.data.health.node_list.length === 1} />
                                    ))}
                                </div>
                            </section>
                        )}
                        <section className='mon:min-w-0'>
                            <SectionTitle>Alerts</SectionTitle>
                            <AlertsTable alerts={data.data.alerts} showSubject canAcknowledge pending={acknowledging.isPending} onAcknowledge={(id) => acknowledging.mutate(id)} />
                        </section>
                        <div className='mon:grid mon:grid-cols-1 mon:min-w-0 mon:items-start mon:gap-6 mon:md:grid-cols-2 mon:xl:grid-cols-3'>
                            <PanelBox health={data.data.health} />
                            <JobsBox health={data.data.health} />
                            <div className='mon:min-w-0 mon:md:col-span-2 mon:xl:col-span-1'>
                                <RulesBox
                                    title='Rules for all servers'
                                    rules={data.data.rules}
                                    channels={data.data.channels}
                                    canManage
                                    global
                                    saving={saving.isPending}
                                    removing={removal.isPending}
                                    onSave={(input, id, done) => saving.mutate({ input, id, done })}
                                    onDelete={(id, done) => removal.mutate({ id, done })}
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </PageContentBlock>
    );
}

const details = (node: NodeHealth) => (node.reachable === false ? `Down since ${formatAgo(node.down_since)}` : [node.os, node.cpu_threads && `${node.cpu_threads} threads`].filter(Boolean).join(' · '));

function NodesTable({ nodes }: { nodes: NodeHealth[] }) {
    return (
        <Table
            rows={nodes}
            keyOf={(node) => String(node.id)}
            emptyState='No nodes yet.'
            columns={[
                {
                    id: 'name',
                    label: 'Node',
                    cell: (node) => (
                        <div className='mon:min-w-0 mon:max-w-44 mon:sm:max-w-xs mon:lg:max-w-md'>
                            <p className='mon:truncate mon:text-foreground' title={node.name}>
                                {node.name}
                            </p>
                            <p className='mon:truncate mon:text-xs mon:text-muted-foreground' title={details(node)}>
                                {details(node)}
                            </p>
                        </div>
                    ),
                },
                {
                    id: 'status',
                    label: 'Status',
                    cell: (node) => (node.reachable === null ? <Pill>Checking</Pill> : node.reachable ? <Pill tone='success'>Online</Pill> : <Pill tone='danger'>Offline</Pill>),
                },
                {
                    id: 'wings',
                    label: 'Wings',
                    cell: (node) => (
                        <span className='mon:flex mon:flex-wrap mon:items-center mon:gap-1'>
                            {node.version ?? '–'}
                            {node.version && node.latest && node.version.replace(/^v/, '') !== node.latest.replace(/^v/, '') && <Pill tone='warning'>{node.latest} available</Pill>}
                        </span>
                    ),
                },
                { id: 'servers', label: 'Running', cell: (node) => `${node.servers.running} / ${node.servers.total}` },
            ]}
        />
    );
}

function SectionTitle({ children }: { children: ReactNode }) {
    return <h2 className='mon:mb-3 mon:font-header mon:text-sm mon:font-semibold mon:uppercase mon:tracking-wide mon:text-foreground'>{children}</h2>;
}

/** A label and value on one line. Long text truncates with the full text on hover, `wrap` lets the value wrap instead. */
function Row({ label, title, wrap = false, children }: { label: string; title?: string | null; wrap?: boolean; children: ReactNode }) {
    return (
        <div className='mon:flex mon:min-w-0 mon:items-start mon:justify-between mon:gap-3'>
            <span className='mon:min-w-0 mon:truncate mon:text-muted-foreground' title={label}>
                {label}
            </span>
            <span
                className={`mon:min-w-0 mon:max-w-[65%] mon:shrink-0 mon:text-right mon:text-foreground ${wrap ? 'mon:flex mon:flex-wrap mon:justify-end mon:gap-x-2' : 'mon:truncate'}`}
                title={title ?? (typeof children === 'string' ? children : undefined)}
            >
                {children}
            </span>
        </div>
    );
}

function PanelBox({ health }: { health: Health }) {
    const { host, versions } = health;

    return (
        <TitledGreyBox title='Panel'>
            <div className='mon:grid mon:grid-cols-1 mon:gap-3 mon:text-sm'>
                <Row label='Version'>{versions.panel}</Row>
                <Row label='PHP'>{versions.php}</Row>
                {versions.database && (
                    <Row label='Database' title={versions.database_full}>
                        {versions.database}
                    </Row>
                )}
                {versions.redis && <Row label='Redis'>{versions.redis}</Row>}
                {host.uptime !== null && <Row label='Host uptime'>{formatDuration(host.uptime)}</Row>}
                {host.load && <Row label={host.cpus ? `Load · ${host.cpus} CPUs` : 'Load'}>{host.load.map((value) => value.toFixed(2)).join(' · ')}</Row>}
                {host.memory && (
                    <UsageBar label={`${host.memory.container ? 'Container memory' : 'Memory'} ${formatBytes(host.memory.used)} of ${formatBytes(host.memory.total)}`} used={host.memory.used} total={host.memory.total} />
                )}
                {host.disk.total && host.disk.free !== null && (
                    <UsageBar label={`Storage ${formatBytes(host.disk.total - host.disk.free)} of ${formatBytes(host.disk.total)}`} used={host.disk.total - host.disk.free} total={host.disk.total} />
                )}
            </div>
        </TitledGreyBox>
    );
}

function JobsBox({ health }: { health: Health }) {
    const status = (ok: boolean) => (ok ? <Pill tone='success'>OK</Pill> : <Pill tone='danger'>Late</Pill>);

    return (
        <TitledGreyBox title='Background jobs'>
            <div className='mon:grid mon:grid-cols-1 mon:gap-3 mon:text-sm'>
                <Row label={`Scheduler · ${formatAgo(health.scheduler.at)}`}>{status(health.scheduler.ok)}</Row>
                <Row label={`Queue worker · ${formatAgo(health.queue.at)}`}>{status(health.queue.ok)}</Row>
                <Row label='Waiting jobs' wrap>
                    {Object.entries(health.queues).map(([queue, size]) => (
                        <span key={queue} className='mon:whitespace-nowrap'>
                            {queue} {size ?? '?'}
                        </span>
                    ))}
                </Row>
                <Row label='Failed jobs'>{health.failed_jobs > 0 ? <Pill tone='warning'>{health.failed_jobs}</Pill> : '0'}</Row>
            </div>
        </TitledGreyBox>
    );
}
