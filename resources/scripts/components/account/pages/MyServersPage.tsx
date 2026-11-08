import { useMemo } from 'react';
import {
    ArrowRight,
    Cpu,
    EthernetPort,
    HardDrive,
    MemoryStick,
    Play,
    RotateCw,
    Server as ServerIcon,
    Square,
} from 'lucide-react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAccountServers, useServerResourceUsage } from '@/api/account/servers/queries';
import { useSendPowerAction } from '@/api/server/power/queries';
import type { ClientServerResource, ClientStatsAttributes } from '@/api/generated';
import { bytesToString, ip } from '@/lib/formatters';
import { hasPermission } from '@/plugins/usePermissions';
import { useDashboardSearch } from '@/router/pageSearch';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import Spinner from '@/components/elements/Spinner';
import { cn } from '@/lib/cn';

type Server = ClientServerResource['attributes'] & { meta?: ClientServerResource['meta']; relationships?: any };

type State =
    | { kind: 'loading' }
    | { kind: 'unavailable'; label: string; tone: string }
    | { kind: 'ready'; power: string; cpu: number; cpuLimit: number; memory: number; memoryLimit: number; disk: number; diskLimit: number };

function stateFor(server: Server, stats: ClientStatsAttributes | undefined, pending: boolean, error: boolean): State {
    if (server.is_suspended) return { kind: 'unavailable', label: 'Suspended', tone: 'text-red-300 border-red-500/20 bg-red-500/10' };
    if (server.is_transferring) return { kind: 'unavailable', label: 'Transferring', tone: 'text-amber-300 border-amber-500/20 bg-amber-500/10' };
    if (server.status === 'installing' || server.status === 'install_failed' || server.status === 'reinstall_failed')
        return { kind: 'unavailable', label: 'Installing', tone: 'text-sky-300 border-sky-500/20 bg-sky-500/10' };
    if (server.status === 'restoring_backup') return { kind: 'unavailable', label: 'Restoring', tone: 'text-sky-300 border-sky-500/20 bg-sky-500/10' };
    if (server.status) return { kind: 'unavailable', label: server.status, tone: 'text-zinc-300 border-zinc-500/20 bg-zinc-500/10' };
    if (pending && !stats) return { kind: 'loading' };
    if (!stats || error) return { kind: 'unavailable', label: 'No report', tone: 'text-zinc-300 border-zinc-500/20 bg-zinc-500/10' };
    return {
        kind: 'ready',
        power: stats.current_state,
        cpu: stats.resources.cpu_absolute,
        cpuLimit: server.limits?.cpu ?? 0,
        memory: stats.resources.memory_bytes,
        memoryLimit: (server.limits?.memory ?? 0) * 1024 * 1024,
        disk: stats.resources.disk_bytes,
        diskLimit: (server.limits?.disk ?? 0) * 1024 * 1024,
    };
}

function dot(power: string) {
    if (power === 'running') return 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.14)]';
    if (power === 'starting' || power === 'stopping') return 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,.14)]';
    return 'bg-zinc-500 shadow-[0_0_0_4px_rgba(113,113,122,.14)]';
}

const meter = (value: number, limit: number) => (!limit ? 0 : Math.min(100, (value / limit) * 100));

function PowerBtn({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: typeof Play; onClick: () => void; disabled?: boolean; danger?: boolean }) {
    return (
        <button type='button' aria-label={label} title={label}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onClick(); }} disabled={disabled}
            className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition',
                'hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-35',
                danger && 'hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300',
            )}>
            <Icon className='h-4 w-4' />
        </button>
    );
}

function Metric({ icon: Icon, label, value, limit, percent, bar }: { icon: typeof Cpu; label: string; value: string; limit: string; percent: number; bar: string }) {
    return (
        <div className='rounded-xl border border-white/[0.08] bg-black/15 p-3'>
            <div className='mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500'><Icon className='h-3.5 w-3.5' />{label}</div>
            <div className='flex items-baseline justify-between gap-2'>
                <div className='text-sm font-semibold text-zinc-100'>{value}</div>
                <div className='text-[11px] text-zinc-500'>/ {limit}</div>
            </div>
            <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]'><div className={cn('h-full rounded-full', bar)} style={{ width: `${percent}%` }} /></div>
        </div>
    );
}

function ServerCard({ resource }: { resource: ClientServerResource }) {
    const server = resource.attributes as Server;
    const meta = resource.meta;
    const perms = meta?.is_server_owner ? ['*'] : (meta?.user_permissions ?? []);
    const sendPower = useSendPowerAction();
    const { data, isPending, isError } = useServerResourceUsage(server.uuid);
    const alloc = resource.relationships?.allocations?.data?.find((a: any) => a?.is_default);
    const address = alloc?.ip ? String(alloc.ip) : null;
    const st = useMemo(() => stateFor(server, data, isPending, isError), [server, data, isPending, isError]);
    const can = (perm: string) => perms[0] === '*' || hasPermission(perms as readonly string[], perm);
    const running = st.kind === 'ready' && st.power === 'running';
    const starting = st.kind === 'ready' && st.power === 'starting';
    const stopping = st.kind === 'ready' && st.power === 'stopping';
    const power = (signal: 'start' | 'restart' | 'stop') => sendPower.mutate({ path: { server_uuid: server.uuid }, body: { signal } } as any);

    return (
        <div className='group overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.022))] p-4 shadow-[0_18px_50px_-38px_rgba(0,0,0,.9)] transition hover:border-white/[0.16]'>
            <div className='mb-4 flex items-start justify-between gap-3'>
                <div className='flex min-w-0 items-start gap-3'>
                    <div className='relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-100'>
                        <ServerIcon className='h-5 w-5' />
                        {st.kind === 'ready' && <span className={cn('absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#121317]', dot(st.power))} />}
                    </div>
                    <div className='min-w-0'>
                        <Link to='/server/$id' params={{ id: server.identifier }} className='block truncate text-[15px] font-semibold text-white hover:text-zinc-200'>{server.name}</Link>
                        <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500'>
                            {address && <span className='inline-flex items-center gap-1.5 font-mono'><EthernetPort className='h-3.5 w-3.5' />{address}</span>}
                            {server.node && <span>{server.node}</span>}
                            <span className='font-mono text-zinc-600'>{server.identifier}</span>
                        </div>
                        {server.description && <p className='mt-1 line-clamp-1 text-xs text-zinc-500'>{server.description}</p>}
                    </div>
                </div>
                <div className='flex shrink-0 items-center gap-1.5'>
                    <PowerBtn label='Start' icon={Play} onClick={() => power('start')} disabled={sendPower.isPending || running || starting || !can('control.start')} />
                    <PowerBtn label='Restart' icon={RotateCw} onClick={() => power('restart')} disabled={sendPower.isPending || !running || stopping || !can('control.restart')} />
                    <PowerBtn label='Stop' icon={Square} onClick={() => power('stop')} disabled={sendPower.isPending || (!running && !starting) || stopping || !can('control.stop')} danger />
                </div>
            </div>

            {st.kind === 'loading' && <div className='flex h-[108px] items-center justify-center rounded-xl border border-white/[0.08] bg-black/10'><Spinner size='small' /></div>}
            {st.kind === 'unavailable' && <div className='flex h-[108px] items-center justify-center rounded-xl border border-white/[0.08] bg-black/10'><span className={cn('rounded-full border px-3 py-1 text-xs font-medium', st.tone)}>{st.label}</span></div>}
            {st.kind === 'ready' && (
                <div className='grid gap-2 sm:grid-cols-3'>
                    <Metric icon={Cpu} label='CPU' value={`${st.cpu.toFixed(1)}%`} limit={st.cpuLimit ? `${st.cpuLimit}%` : '∞'} percent={meter(st.cpu, st.cpuLimit || 100)} bar='bg-sky-400/80' />
                    <Metric icon={MemoryStick} label='Memory' value={bytesToString(st.memory)} limit={st.memoryLimit ? bytesToString(st.memoryLimit) : '∞'} percent={meter(st.memory, st.memoryLimit)} bar='bg-violet-400/80' />
                    <Metric icon={HardDrive} label='Disk' value={bytesToString(st.disk)} limit={st.diskLimit ? bytesToString(st.diskLimit) : '∞'} percent={meter(st.disk, st.diskLimit)} bar='bg-amber-400/80' />
                </div>
            )}

            <div className='mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3'>
                <div className='text-[11px] uppercase tracking-[0.14em] text-zinc-500'>{st.kind === 'ready' ? st.power : server.status || 'server'}</div>
                <Link to='/server/$id' params={{ id: server.identifier }} className='inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 transition hover:text-white'>Manage <ArrowRight className='h-3.5 w-3.5' /></Link>
            </div>
        </div>
    );
}

export default function MyServersPage() {
    const search = useDashboardSearch();
    const navigate = useNavigate();
    const page = search.page ?? 1;
    const servers = useAccountServers({ page });
    const items = servers.data?.data ?? [];
    const pagination = servers.data?.meta?.pagination;

    return (
        <PageContentBlock title='My Servers' showFlashKey='my-server'>
            <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
                <div>
                    <h1 className='text-2xl font-semibold tracking-tight text-foreground'>My Servers</h1>
                    <p className='mt-1 text-sm text-muted-foreground'>All servers available to your account.</p>
                </div>
                {pagination && pagination.total > 0 && (
                    <div className='rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground'>{pagination.total} server{pagination.total === 1 ? '' : 's'}</div>
                )}
            </div>

            {!servers.data && !servers.isError ? (
                <div className='flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card/40'><Spinner centered /></div>
            ) : servers.isError ? (
                <div className='rounded-2xl border border-border bg-card/50 p-10 text-center text-sm text-red-300'>Unable to load servers.</div>
            ) : items.length === 0 ? (
                <div className='rounded-2xl border border-border bg-card/50 p-10 text-center'>
                    <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/30'><ServerIcon className='h-5 w-5 text-muted-foreground' /></div>
                    <div className='text-sm font-medium text-foreground'>No servers found</div>
                    <p className='mt-1 text-sm text-muted-foreground'>Servers assigned to your account will appear here.</p>
                </div>
            ) : (
                <>
                    <div className='grid gap-4 xl:grid-cols-2'>{items.map(r => <ServerCard key={r.attributes.uuid} resource={r} />)}</div>
                    {pagination && (
                        <PaginationFooter pagination={pagination} onPageSelect={p => void navigate({ to: '/my-server', search: p > 1 ? { page: p } : {}, replace: true })} />
                    )}
                </>
            )}
        </PageContentBlock>
    );
}
