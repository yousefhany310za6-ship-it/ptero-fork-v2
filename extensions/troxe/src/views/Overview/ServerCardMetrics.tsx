import { Cpu, HardDrive, MemoryStick, type LucideIcon } from 'lucide-react';
import { Badge, Spinner, bytesToString, cn } from '@pterodactyl/sdk';
import {
    type ServerCardState,
    type ServerStatMetric,
    type ServerUnavailableReason,
    type UiTone,
    type ViewProps,
} from '@pterodactyl/sdk/theme';
import { meterColor } from './kit';

const unavailableLabels = {
    suspended: 'Suspended',
    'connection-error': 'Connection Error',
    maintenance: 'Under Maintenance',
    transferring: 'Transferring',
    installing: 'Installing',
    'restoring-backup': 'Restoring Backup',
    unavailable: 'Unavailable',
} as const;

const unavailableTones = {
    suspended: 'danger',
    'connection-error': 'danger',
    maintenance: 'warning',
    transferring: 'neutral',
    installing: 'neutral',
    'restoring-backup': 'neutral',
    unavailable: 'neutral',
} satisfies Record<ServerUnavailableReason, UiTone>;

/** One live number: the reading, its share of the cap, and the alarm colour both share. */
function Metric({ icon: Glyph, label, metric, text }: {
    icon: LucideIcon;
    label: string;
    metric: ServerStatMetric;
    text: string;
}) {
    const percent = metric.limit > 0 ? Math.min(100, (metric.value / metric.limit) * 100) : 0;

    return (
        <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
            <div className='flex items-baseline justify-between gap-2'>
                <span className='flex items-center gap-1 fs-micro font-semibold uppercase tracking-[0.12em] text-ink-muted'>
                    <Glyph className='size-3 shrink-0' aria-hidden />
                    {label}
                </span>
                <span className='min-w-0 truncate fs-tiny tabular-nums text-ink-secondary' title={text}>
                    {text}
                </span>
            </div>
            <div
                className='troxe-meter'
                style={{ ['--meter-color' as string]: meterColor(metric) }}
                role='meter'
                aria-label={label}
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <span style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
}

function Content({ state }: { state: ServerCardState }) {
    if (state.kind === 'loading') {
        return (
            <div className='flex flex-1 items-center justify-center'>
                <Spinner size='small' />
            </div>
        );
    }

    if (state.kind === 'unavailable') {
        return (
            <div className='flex flex-1 items-center justify-center'>
                <Badge tone={unavailableTones[state.reason]}>{unavailableLabels[state.reason]}</Badge>
            </div>
        );
    }

    return (
        <>
            <Metric
                icon={Cpu}
                label='CPU'
                metric={state.cpu}
                text={`${state.cpu.value.toFixed(1)}%${state.cpu.limit > 0 ? ` of ${state.cpu.limit}%` : ''}`}
            />
            <Metric
                icon={MemoryStick}
                label='Memory'
                metric={state.memory}
                text={`${bytesToString(state.memory.value)}${state.memory.limit > 0 ? ` of ${bytesToString(state.memory.limit, 0)}` : ''}`}
            />
            <Metric
                icon={HardDrive}
                label='Disk'
                metric={state.disk}
                text={`${bytesToString(state.disk.value)}${state.disk.limit > 0 ? ` of ${bytesToString(state.disk.limit, 0)}` : ''}`}
            />
        </>
    );
}

/** The card's reading third: three thin meters sharing the meter colour rule with the console. */
export default function ServerCardMetrics({ model, className }: ViewProps<'dashboard.serverCard.metrics'>) {
    return (
        <div className={cn('col-span-12 flex min-w-0 items-center gap-4 sm:col-span-6 lg:col-span-5', className)}>
            <Content state={model.state} />
        </div>
    );
}
