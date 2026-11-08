import { useMemo } from 'react';
import { Activity, HardDrive, MemoryStick, Server } from 'lucide-react';
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    ListRow,
    NamedIcon,
    NewLinkButton,
    Pagination,
    PanelLink,
    Stat,
    Switch,
    bytesToString,
    cn,
} from '@pterodactyl/sdk';
import { Slot, View, type ServerListItem, type UiTone, type ViewProps } from '@pterodactyl/sdk/theme';
import { cores, meterPercent, summarize, type Summary } from './summary';

/** Running is good, starting and stopping are on their way, and anything else is down. */
function toneOf({ state }: ServerListItem): UiTone {
    if (state.kind !== 'ready' || state.power === 'offline') {
        return 'danger';
    }

    return state.power === 'running' ? 'success' : 'warning';
}

/** The one colour rule the meters share with the console: 80% is a warning, 90% is a fault. */
function meterTone(percent: number): UiTone {
    if (percent >= 90) return 'danger';
    if (percent >= 80) return 'warning';

    // Headroom is not an achievement, so a healthy meter is the brand blue, not a success green.
    return 'accent';
}

function ServerRow({ item, className }: { item: ServerListItem; className?: string }) {
    const { server } = item;

    return (
        <ListRow
            destination={{ to: '/server/$id', params: { id: item.identifier } }}
            aria-label={item.name}
            status={toneOf(item)}
            className={cn('grid grid-cols-12 gap-4', className)}
        >
            <Slot name='dashboard.serverRow.before' data={server} />
            <div className='col-span-12'>
                <View name='dashboard.serverCard' server={server} />
            </div>
            <Slot name='dashboard.serverRow.metrics.after' data={server} />
            <Slot name='dashboard.serverRow.after' data={server} />
        </ListRow>
    );
}

/** The four numbers the account is judged by, all of them read off the servers on this page. */
function Tiles({ summary }: { summary: Summary }) {
    const memory = meterPercent(summary.memory.used, summary.memory.allowed);
    const disk = meterPercent(summary.disk.used, summary.disk.allowed);

    if (!summary.ready) {
        return (
            <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className='troxe-card h-[5.5rem] animate-pulse' aria-hidden />
                ))}
            </div>
        );
    }

    return (
        <div className='grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4'>
            <Stat
                label='Servers'
                value={summary.servers}
                icon={Server}
                limit={summary.partial ? `${summary.servers} in all` : undefined}
                tone={summary.servers > 0 ? 'accent' : 'neutral'}
            />
            <Stat
                label='Running'
                value={summary.running}
                icon={Activity}
                limit={
                    summary.silent > 0
                        ? `${summary.offline} stopped, ${summary.silent} no report`
                        : `${summary.offline} stopped`
                }
                tone={summary.running > 0 ? 'success' : 'neutral'}
            />
            <Stat
                label='Memory'
                value={bytesToString(summary.memory.used, 0)}
                icon={MemoryStick}
                limit={`of ${bytesToString(summary.memory.allowed, 0)}`}
                meter={memory}
                tone={meterTone(memory)}
            />
            <Stat
                label='Disk'
                value={bytesToString(summary.disk.used, 0)}
                icon={HardDrive}
                limit={`of ${bytesToString(summary.disk.allowed, 0)}`}
                meter={disk}
                tone={meterTone(disk)}
            />
        </div>
    );
}

/** The same two pools as the tiles, drawn against the plan the account pays for. */
function Resources({ summary }: { summary: Summary }) {
    const rows = [
        {
            label: 'Memory',
            percent: meterPercent(summary.memory.used, summary.memory.allowed),
            text: `${bytesToString(summary.memory.used)} of ${bytesToString(summary.memory.allowed)}`,
            color: 'var(--metric-mem)',
        },
        {
            label: 'Disk',
            percent: meterPercent(summary.disk.used, summary.disk.allowed),
            text: `${bytesToString(summary.disk.used)} of ${bytesToString(summary.disk.allowed)}`,
            color: 'var(--metric-disk)',
        },
        {
            label: 'CPU',
            percent: meterPercent(summary.cpu, summary.cpuAllowed),
            text: `${summary.cpu.toFixed(1)}% of ${cores(summary.cpuAllowed)}`,
            color: 'var(--metric-cpu)',
        },
    ];

    return (
        <section className='troxe-card p-4 sm:p-5'>
            <header className='mb-4 flex items-center justify-between gap-3'>
                <h2 className='flex items-center gap-2 fs-lead font-bold tracking-tight'>
                    <NamedIcon name='chart-no-axes-combined' className='size-4 shrink-0 text-primary' aria-hidden />
                    Usage across your servers
                </h2>
                {summary.partial && (
                    <span className='troxe-chip'>This page of {summary.servers}</span>
                )}
            </header>
            <div className='flex flex-col gap-4'>
                {rows.map((row) => (
                    <div key={row.label}>
                        <div className='mb-1.5 flex items-baseline justify-between gap-2'>
                            <span className='fs-micro font-semibold uppercase tracking-[0.14em] text-ink-muted'>
                                {row.label}
                            </span>
                            <span className='fs-tiny tabular-nums text-ink-secondary'>{row.text}</span>
                        </div>
                        <div className='troxe-meter is-thick' style={{ ['--meter-color' as string]: row.color }}>
                            <span style={{ width: `${summary.ready ? row.percent : 0}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** A suspended, still-installing or maintained server is the only news a hosting overview owes you. */
function Notices({ summary }: { summary: Summary }) {
    const copy = {
        suspended: { icon: 'circle-pause', text: 'is suspended — renew it or ask about it.', tone: 'text-destructive' },
        installing: { icon: 'cloud-download', text: 'is still installing.', tone: 'text-warning' },
        maintenance: { icon: 'wrench', text: 'sits on a node under maintenance.', tone: 'text-warning' },
    } as const;

    return (
        <div className='flex flex-col gap-2'>
            {summary.notices.map(({ kind, item }) => {
                const { icon, text, tone } = copy[kind];

                return (
                    <div key={item.uuid} className='troxe-card flex items-center gap-3 px-4 py-3'>
                        <NamedIcon name={icon} className={cn('size-4 shrink-0', tone)} />
                        <p className='min-w-0 flex-1 truncate fs-small'>
                            <PanelLink
                                destination={{ to: '/server/$id', params: { id: item.identifier } }}
                                className='font-semibold text-foreground hover:underline'
                            >
                                {item.name}
                            </PanelLink>{' '}
                            <span className={tone}>{text}</span>
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

function NoServers({ model }: { model: ViewProps<'dashboard.serverList'>['model'] }) {
    const others = model.scope === 'others';

    return (
        <Empty className='troxe-card border-dashed p-6'>
            <EmptyHeader>
                <EmptyMedia variant='icon'>
                    <NamedIcon name='server' />
                </EmptyMedia>
                <EmptyTitle>{others ? 'No other servers' : 'No servers yet'}</EmptyTitle>
                <EmptyDescription>
                    {others
                        ? 'There are no servers owned by other users.'
                        : 'Servers you own or are invited to will appear here.'}
                </EmptyDescription>
            </EmptyHeader>
            {model.canCreateServers && (
                <EmptyContent>
                    <NewLinkButton to='/panel/servers/new'>New server</NewLinkButton>
                </EmptyContent>
            )}
        </Empty>
    );
}

export default function ServerList({ model, className }: ViewProps<'dashboard.serverList'>) {
    const summary = useMemo(() => summarize(model), [model]);
    const others = model.scope === 'others';
    const { pagination } = model;

    return (
        <div className={cn('flex flex-col gap-4 sm:gap-5', className)}>
            <Tiles summary={summary} />
            <Resources summary={summary} />
            {!!summary.notices.length && <Notices summary={summary} />}
            <section className='flex flex-col gap-3'>
                <header className='flex flex-wrap items-center justify-between gap-3'>
                    <h2 className='fs-lead font-bold tracking-tight'>Your servers</h2>
                    {model.canViewOthers && (
                        <Switch
                            checked={others}
                            onChange={() => model.actions.setScope(others ? 'mine' : 'others')}
                            label={others ? "Showing others' servers" : 'Showing your servers'}
                            controlPosition='end'
                            className='gap-2'
                        />
                    )}
                </header>
                <Slot name='dashboard.before' />
                {pagination ? (
                    <Pagination
                        data={{
                            data: [...model.servers],
                            meta: {
                                pagination: {
                                    total: pagination.total,
                                    count: pagination.count,
                                    per_page: pagination.perPage,
                                    current_page: pagination.currentPage,
                                    total_pages: pagination.totalPages,
                                },
                            },
                        }}
                        onPageSelect={model.actions.setPage}
                    >
                        {({ items }) =>
                            items.length > 0 ? (
                                items.map((item, index) => (
                                    <ServerRow key={item.uuid} item={item} className={index > 0 ? 'mt-2' : undefined} />
                                ))
                            ) : (
                                <NoServers model={model} />
                            )
                        }
                    </Pagination>
                ) : (
                    <div className='troxe-card min-h-24 animate-pulse' aria-hidden />
                )}
                <Slot name='dashboard.after' />
            </section>
        </div>
    );
}
