import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CopyOnClick, NamedIcon } from '@pterodactyl/sdk';
import { cn, type ServerStatMetric, type ViewProps } from '@pterodactyl/sdk/theme';

/** The metric accents the theme exposes, so the gauges agree with the rest of the console. */
const colors = {
    cpu: 'var(--metric-cpu)',
    mem: 'var(--metric-mem)',
    disk: 'var(--metric-disk)',
    rx: 'var(--metric-rx)',
    tx: 'var(--metric-tx)',
    neutral: 'var(--metric-neutral)',
    danger: 'var(--destructive)',
    warning: 'var(--warning)',
} as const;

/** Two minutes of two-second samples, the window the engine's charts drew. */
const SAMPLES = 60;
const SAMPLE_MS = 2000;

interface Sample {
    readonly t: number;
    readonly cpu: number;
    readonly rxRate: number;
    readonly txRate: number;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

/** Usage against the plan, which is what a gauge reads; a limit of 0 is unlimited. */
const percent = (metric: ServerStatMetric) =>
    metric.limit > 0 ? clampPercent((metric.value / metric.limit) * 100) : 0;

/** Past ninety, or on a node alarm, the gauge goes red — the meter's only colour rule. */
const colorFor = (metric: ServerStatMetric, color: string) =>
    metric.alarm === 'danger' || percent(metric) >= 90
        ? colors.danger
        : metric.alarm === 'warning'
          ? colors.warning
          : color;

function fmtBytes(bytes: number): string {
    const value = Number(bytes) || 0;
    if (value <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = value;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }

    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function fmtRate(bytesPerSecond: number): string {
    const value = Number(bytesPerSecond) || 0;
    if (value < 1) return '0 B/s';

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let v = value;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }

    return `${v.toFixed(v < 10 && i > 0 ? 2 : v < 100 && i > 0 ? 1 : 0)} ${units[i]}`;
}

const fmtPct = (pct: number) => `${(Number(pct) || 0).toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;

/** "4d 2h 7m" — the shape the engine used for its uptime note. */
function fmtUptime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);

    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s % 60}s`;

    return `${s}s`;
}

const plan = (limit: number) => (limit > 0 ? fmtBytes(limit) : 'Unlimited');

function Card({
    icon,
    title,
    accent,
    right,
    children,
    className,
}: {
    icon: string;
    title: string;
    accent: string;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn('troxe-card troxe-glow flex flex-col gap-4 p-5', className)}
            style={{ '--card-glow': `color-mix(in oklab, ${accent} 12%, transparent)` } as CSSProperties}
        >
            <header className='flex items-center gap-3'>
                <span
                    className='flex size-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-veil'
                    style={{ color: accent }}
                >
                    <NamedIcon name={icon} className='size-[18px]' aria-hidden />
                </span>
                <h3 className='min-w-0 flex-1 truncate fs-lead font-semibold'>{title}</h3>
                {right}
            </header>
            {children}
        </section>
    );
}

/** Circular progress with the value in the middle. */
function Ring({ pct, color, label }: { pct: number; color: string; label: string }) {
    const p = clampPercent(pct);
    const r = 22;
    const c = 2 * Math.PI * r;

    return (
        <div
            className='relative size-14 shrink-0'
            role='progressbar'
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p)}
        >
            <svg viewBox='0 0 56 56' className='size-full -rotate-90' aria-hidden>
                <circle cx='28' cy='28' r={r} fill='none' style={{ stroke: 'var(--meter-track)' }} strokeWidth='4' />
                <circle
                    cx='28'
                    cy='28'
                    r={r}
                    fill='none'
                    style={{ stroke: color, transition: 'stroke-dasharray .6s ease' }}
                    strokeWidth='4'
                    strokeLinecap='round'
                    strokeDasharray={`${(c * p) / 100} ${c}`}
                />
            </svg>
            <span className='absolute inset-0 flex items-center justify-center fs-tiny font-bold tabular-nums'>
                {fmtPct(p)}
            </span>
        </div>
    );
}

function Trio({ items }: { items: readonly (readonly [string, string, string?])[] }) {
    return (
        <dl className='grid grid-cols-3 gap-2 text-center'>
            {items.map(([label, value, dot]) => (
                <div key={label} className='min-w-0'>
                    <dt className='flex items-center justify-center gap-1.5 fs-micro font-semibold tracking-[0.12em] text-ink-muted uppercase'>
                        {dot && <span className='size-1.5 rounded-full' style={{ backgroundColor: dot }} />}
                        {label}
                    </dt>
                    <dd className='mt-1 truncate fs-small font-semibold tabular-nums'>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

interface Series {
    readonly id: string;
    readonly color: string;
    readonly values: readonly number[];
}

/** Responsive multi-series area/line chart (SVG, no dependencies). */
function LineChart({ series, max, empty }: { series: readonly Series[]; max: number; empty: string }) {
    const W = 300;
    const H = 100;
    // Spread the samples over the full width as soon as there are a few of them, so a
    // fixed 60-slot axis does not squeeze early data against the right edge.
    const build = (values: readonly number[]) => {
        const span = Math.max(values.length - 1, 7);
        const pts = values.map((v, i) => [(i / span) * W, H - 2 - Math.max(0, Math.min(1, v / max)) * (H - 6)]);
        if (!pts.length) return null;
        const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        const first = pts[0];
        const last = pts[pts.length - 1];

        return { line, area: `${line} L${last[0].toFixed(1)} ${H} L${first[0].toFixed(1)} ${H} Z` };
    };
    const hasData = series.some((s) => s.values.length > 1);

    return (
        <div className='troxe-inner relative h-32 w-full overflow-hidden bg-veil'>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio='none' className='absolute inset-0 size-full' aria-hidden>
                <defs>
                    {series.map((s) => (
                        <linearGradient key={s.id} id={`troxe-g-${s.id}`} x1='0' y1='0' x2='0' y2='1'>
                            <stop offset='0%' style={{ stopColor: s.color, stopOpacity: 0.28 }} />
                            <stop offset='100%' style={{ stopColor: s.color, stopOpacity: 0 }} />
                        </linearGradient>
                    ))}
                </defs>
                {[25, 50, 75].map((y) => (
                    <line
                        key={y}
                        x1='0'
                        x2={W}
                        y1={y}
                        y2={y}
                        style={{ stroke: 'var(--meter-track)' }}
                        strokeDasharray='3 4'
                        vectorEffect='non-scaling-stroke'
                    />
                ))}
                {series.map((s) => {
                    const p = build(s.values);
                    if (!p || s.values.length < 2) return null;

                    return (
                        <g key={s.id}>
                            <path d={p.area} fill={`url(#troxe-g-${s.id})`} />
                            <path
                                d={p.line}
                                fill='none'
                                style={{ stroke: s.color }}
                                strokeWidth='2'
                                strokeLinejoin='round'
                                strokeLinecap='round'
                                vectorEffect='non-scaling-stroke'
                            />
                        </g>
                    );
                })}
                {!hasData && (
                    <line
                        x1='0'
                        x2={W}
                        y1={H - 2}
                        y2={H - 2}
                        style={{ stroke: 'var(--hairline-hover)' }}
                        vectorEffect='non-scaling-stroke'
                    />
                )}
            </svg>
            {!hasData && (
                <span className='absolute inset-0 flex items-center justify-center fs-tiny text-ink-muted'>
                    {empty}
                </span>
            )}
        </div>
    );
}

/** Horizontal bar with quarter ticks. */
function SegmentedBar({ pct, color }: { pct: number; color: string }) {
    const p = clampPercent(pct);

    return (
        <div className='relative'>
            <div className='troxe-meter is-thick'>
                <span
                    style={{
                        width: `${p}%`,
                        background: `linear-gradient(90deg, color-mix(in oklab, ${color} 60%, transparent), ${color})`,
                    }}
                />
            </div>
            {[25, 50, 75].map((t) => (
                <span key={t} className='troxe-tick' style={{ left: `${t}%` }} />
            ))}
        </div>
    );
}

/** Semicircle speedometer with the used value in the middle. */
function Gauge({ pct, color, value, caption }: { pct: number; color: string; value: string; caption: string }) {
    const p = clampPercent(pct);
    const R = 80;
    const len = Math.PI * R;
    const theta = Math.PI * (1 - p / 100);
    const dx = 100 + R * Math.cos(theta);
    const dy = 100 - R * Math.sin(theta);
    const arc = `M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`;

    return (
        <div className='relative mx-auto w-full max-w-[260px]' aria-hidden>
            <svg viewBox='0 0 200 112' className='w-full'>
                <path d={arc} fill='none' style={{ stroke: 'var(--meter-track)' }} strokeWidth='12' strokeLinecap='round' />
                <path
                    d={arc}
                    fill='none'
                    style={{ stroke: color, strokeOpacity: 0.9, transition: 'stroke-dasharray .6s ease' }}
                    strokeWidth='12'
                    strokeLinecap='round'
                    strokeDasharray={`${(len * p) / 100} ${len}`}
                />
                <circle cx={dx} cy={dy} r='7' style={{ fill: color }} />
                <circle cx={dx} cy={dy} r='12' style={{ fill: color, opacity: 0.18 }} />
            </svg>
            <div className='absolute inset-x-0 bottom-1 flex flex-col items-center'>
                <span className='fs-display leading-none font-bold tabular-nums'>{value}</span>
                <span className='mt-1 fs-tiny font-semibold tracking-[0.12em] text-ink-muted uppercase'>{caption}</span>
            </div>
        </div>
    );
}

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
    return (
        <div className='troxe-inner flex items-center justify-between gap-4 border border-hairline bg-veil px-4 py-3'>
            <span className='fs-small text-ink-muted'>{label}</span>
            <span className={cn('min-w-0 truncate fs-small font-semibold', mono && 'font-mono')}>{value}</span>
        </div>
    );
}

const modes = {
    live: { dot: 'animate-beat bg-success', chip: 'border-success/25 bg-success/10 text-success', label: 'Live · every second' },
    pending: { dot: 'animate-beat bg-warning', chip: 'border-warning/25 bg-warning/10 text-warning', label: 'Changing state' },
    idle: { dot: 'bg-ink-muted', chip: 'border-hairline bg-veil text-ink-secondary', label: 'Server offline' },
} as const;

export default function Stats({ model, className }: ViewProps<'server.stats'>) {
    const live = model.state === 'running' || model.state === 'starting';
    const { cpu, memory, disk } = model;
    const address = model.address ?? 'n/a';

    const values = useRef({ cpu: percent(cpu), rx: model.network.rx, tx: model.network.tx });
    useEffect(() => {
        values.current = { cpu: percent(cpu), rx: model.network.rx, tx: model.network.tx };
    });

    // Samples reset whenever the server leaves the online state, so a restart starts clean.
    const [samples, setSamples] = useState<readonly Sample[]>([]);
    useEffect(() => {
        if (!live) {
            setSamples([]);

            return;
        }

        let previous: { t: number; rx: number; tx: number } | null = null;

        const take = () =>
            setSamples((list) => {
                const current = values.current;
                const t = performance.now();
                const seconds = previous ? (t - previous.t) / 1000 : 0;
                const sample: Sample = {
                    t,
                    cpu: current.cpu,
                    rxRate: previous && seconds > 0 ? Math.max(0, (current.rx - previous.rx) / seconds) : 0,
                    txRate: previous && seconds > 0 ? Math.max(0, (current.tx - previous.tx) / seconds) : 0,
                };
                previous = { t, rx: current.rx, tx: current.tx };

                return [...list.slice(-(SAMPLES - 1)), sample];
            });

        take();
        const id = setInterval(take, SAMPLE_MS);

        return () => clearInterval(id);
    }, [live]);

    const cpuSeries = useMemo(() => samples.map((s) => s.cpu), [samples]);
    const rxSeries = useMemo(() => samples.map((s) => s.rxRate), [samples]);
    const txSeries = useMemo(() => samples.map((s) => s.txRate), [samples]);

    const cpuStats = useMemo(() => {
        if (!cpuSeries.length) return { min: 0, max: 0, avg: 0 };

        return {
            min: Math.min(...cpuSeries),
            max: Math.max(...cpuSeries),
            avg: cpuSeries.reduce((a, b) => a + b, 0) / cpuSeries.length,
        };
    }, [cpuSeries]);

    // The chart autoscales, so a server that never passes 12% still fills the plot.
    const cpuMax = clampPercent(Math.max(10, cpuStats.max * 1.4));
    const netMax = Math.max(1024, ...rxSeries, ...txSeries) * 1.3;

    const last = samples[samples.length - 1];
    const rxNow = last?.rxRate ?? 0;
    const txNow = last?.txRate ?? 0;
    const emptyHint = live ? 'Collecting data…' : 'Server is offline';
    const used = fmtBytes(disk.value);
    const mode = model.state === 'running' ? modes.live : live ? modes.pending : modes.idle;

    return (
        <section aria-label='Resources' className={cn('grid grid-cols-1 gap-4 md:grid-cols-2', className)}>
            <div className='flex flex-wrap items-center justify-between gap-3 md:col-span-2'>
                <div className='min-w-0'>
                    <h2 className='fs-lead font-semibold tracking-tight'>Resources</h2>
                    <p className='mt-0.5 fs-tiny text-ink-secondary'>
                        Live usage of this server, sampled in the browser while it is online.
                    </p>
                </div>
                <span
                    className={cn(
                        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 fs-tiny font-semibold',
                        mode.chip,
                    )}
                >
                    <span className={cn('size-1.5 rounded-full', mode.dot)} />
                    {mode.label}
                </span>
            </div>

            <Card
                icon='cpu'
                title='CPU Usage'
                accent={colorFor(cpu, colors.cpu)}
                right={<Ring pct={percent(cpu)} color={colorFor(cpu, colors.cpu)} label='CPU' />}
            >
                <LineChart series={[{ id: 'cpu', color: colors.cpu, values: cpuSeries }]} max={cpuMax} empty={emptyHint} />
                <Trio
                    items={[
                        ['Min', fmtPct(cpuStats.min)],
                        ['Max', fmtPct(cpuStats.max)],
                        ['Avg', fmtPct(cpuStats.avg)],
                    ]}
                />
            </Card>

            <Card
                icon='memory-stick'
                title='Memory Usage'
                accent={colorFor(memory, colors.mem)}
                right={<Ring pct={percent(memory)} color={colorFor(memory, colors.mem)} label='Memory' />}
            >
                <div className='flex flex-1 flex-col justify-center gap-3 py-6'>
                    <SegmentedBar pct={percent(memory)} color={colorFor(memory, colors.mem)} />
                    <div className='flex justify-between fs-micro text-ink-muted tabular-nums'>
                        <span>0</span>
                        <span>{fmtBytes(memory.limit / 2)}</span>
                        <span>{plan(memory.limit)}</span>
                    </div>
                </div>
                <Trio
                    items={[
                        ['Used', fmtBytes(memory.value)],
                        ['Free', fmtBytes(Math.max(0, memory.limit - memory.value))],
                        ['Total', plan(memory.limit)],
                    ]}
                />
            </Card>

            <Card
                icon='network'
                title='Network I/O'
                accent={colors.rx}
                right={<span className='shrink-0 fs-lead font-bold tabular-nums'>{fmtRate(rxNow + txNow)}</span>}
            >
                <LineChart
                    series={[
                        { id: 'rx', color: colors.rx, values: rxSeries },
                        { id: 'tx', color: colors.tx, values: txSeries },
                    ]}
                    max={netMax}
                    empty={emptyHint}
                />
                <div className='flex items-center justify-center gap-3'>
                    <span className='troxe-chip tabular-nums'>
                        <NamedIcon name='arrow-down' className='size-3.5' style={{ color: colors.rx }} aria-hidden />
                        {fmtBytes(model.network.rx)}
                    </span>
                    <span className='troxe-chip tabular-nums'>
                        <NamedIcon name='arrow-up' className='size-3.5' style={{ color: colors.tx }} aria-hidden />
                        {fmtBytes(model.network.tx)}
                    </span>
                </div>
                <Trio
                    items={[
                        ['In', fmtRate(rxNow), colors.rx],
                        ['Out', fmtRate(txNow), colors.tx],
                        ['Total', fmtRate(rxNow + txNow)],
                    ]}
                />
            </Card>

            <Card
                icon='hard-drive'
                title='Disk Usage'
                accent={colorFor(disk, colors.disk)}
                right={<Ring pct={percent(disk)} color={colorFor(disk, colors.disk)} label='Disk' />}
            >
                <div className='flex flex-1 items-center py-2'>
                    <Gauge
                        pct={percent(disk)}
                        color={colorFor(disk, colors.disk)}
                        value={used.split(' ')[0]}
                        caption={`${used.split(' ')[1] ?? 'B'} used`}
                    />
                </div>
                <Trio
                    items={[
                        ['Used', used],
                        ['Free', fmtBytes(Math.max(0, disk.limit - disk.value))],
                        ['Total', plan(disk.limit)],
                    ]}
                />
            </Card>

            <Card icon='server' title='Server Information' accent={colors.neutral} className='md:col-span-2'>
                <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                    <InfoRow
                        label='Status'
                        value={model.state === null ? 'Offline' : model.state.charAt(0).toUpperCase() + model.state.slice(1)}
                    />
                    <InfoRow
                        label='Address'
                        mono
                        value={
                            <CopyOnClick text={address}>
                                <span className='hover:text-ink-secondary'>{address}</span>
                            </CopyOnClick>
                        }
                    />
                    <InfoRow
                        label='Uptime'
                        value={model.state === null || model.uptime <= 0 ? '—' : fmtUptime(model.uptime / 1000)}
                    />
                    <InfoRow label='CPU allocation' value={cpu.limit > 0 ? `${cpu.limit}%` : 'Unlimited'} />
                    <InfoRow label='Memory allocation' value={plan(memory.limit)} />
                    <InfoRow label='Disk allocation' value={plan(disk.limit)} />
                </div>
            </Card>
        </section>
    );
}
