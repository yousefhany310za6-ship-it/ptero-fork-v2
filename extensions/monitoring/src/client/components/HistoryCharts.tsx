import { Button, NamedIcon, Spinner, Tooltip, httpErrorToHuman } from '@pterodactyl/sdk';
import type { History, Range } from '../api';
import { formatBytes, formatMiB, formatTime } from '../lib/format';
import AreaChart from './AreaChart';
import ChartBlock from './ChartBlock';

const RANGES: { value: Range; label: string }[] = [
    { value: '1h', label: '1 hour' },
    { value: '6h', label: '6 hours' },
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
];

interface Props {
    history: History | undefined;
    error: unknown;
    range: Range;
    onRange: (range: Range) => void;
}

export default function HistoryCharts({ history, error, range, onRange }: Props) {
    return (
        <div className='mon:grid mon:grid-cols-1 mon:gap-4'>
            <div className='mon:flex mon:flex-col mon:gap-3 mon:sm:flex-row mon:sm:items-center mon:sm:justify-between'>
                <p className='mon:min-w-0 mon:text-sm mon:text-muted-foreground'>
                    {history?.uptime != null ? (
                        <>
                            <span className='mon:font-medium mon:text-foreground'>{history.uptime.toFixed(2)}%</span> uptime in the last {RANGES.find((item) => item.value === range)?.label}
                        </>
                    ) : (
                        'No samples yet. The first one arrives within a few minutes.'
                    )}
                </p>
                <div className='mon:flex mon:flex-wrap mon:gap-1' role='group' aria-label='Time range'>
                    {RANGES.map((item) =>
                        item.value === range ? (
                            <Button key={item.value} size='small' aria-pressed>
                                {item.label}
                            </Button>
                        ) : (
                            <Button.Text key={item.value} size='small' onClick={() => onRange(item.value)}>
                                {item.label}
                            </Button.Text>
                        )
                    )}
                </div>
            </div>
            {!history ? (
                error ? <p className='mon:text-sm mon:text-destructive'>{httpErrorToHuman(error)}</p> : <Spinner centered size={Spinner.Size.LARGE} />
            ) : (
                <>
                    <UptimeStrip history={history} />
                    <Charts history={history} />
                </>
            )}
        </div>
    );
}

function Charts({ history }: { history: History }) {
    const times = history.points.map((point) => point.t);
    const values = (key: 'cpu' | 'memory' | 'disk' | 'rx' | 'tx') => history.points.map((point) => point[key]);
    const { limits } = history;

    return (
        <div className='mon:grid mon:grid-cols-1 mon:gap-4 mon:lg:grid-cols-2'>
            <ChartBlock title='CPU Load'>
                <AreaChart times={times} series={[{ key: 'cpu', label: 'CPU', color: 'var(--chart-1)', values: values('cpu') }]} max={limits.cpu || undefined} format={(value) => (value === 0 ? '0%' : `${value.toFixed(value >= 10 ? 0 : 1)}%`)} />
            </ChartBlock>
            <ChartBlock title='Memory'>
                <AreaChart times={times} series={[{ key: 'memory', label: 'Memory', color: 'var(--chart-1)', values: values('memory') }]} max={limits.memory || undefined} format={formatMiB} />
            </ChartBlock>
            <ChartBlock title='Disk'>
                <AreaChart times={times} series={[{ key: 'disk', label: 'Disk', color: 'var(--chart-1)', values: values('disk') }]} max={limits.disk || undefined} format={formatMiB} />
            </ChartBlock>
            <ChartBlock
                title='Network'
                legend={
                    <>
                        <Tooltip content='Inbound'>
                            <span className='mon:text-chart-2'>
                                <NamedIcon name='cloud-download' className='mon:h-4 mon:w-4' />
                            </span>
                        </Tooltip>
                        <Tooltip content='Outbound'>
                            <span className='mon:text-chart-1'>
                                <NamedIcon name='cloud-upload' className='mon:h-4 mon:w-4' />
                            </span>
                        </Tooltip>
                    </>
                }
            >
                <AreaChart
                    times={times}
                    series={[
                        { key: 'tx', label: 'Outbound', color: 'var(--chart-1)', values: values('tx') },
                        { key: 'rx', label: 'Inbound', color: 'var(--chart-2)', values: values('rx') },
                    ]}
                    format={(value) => `${formatBytes(value)}/s`}
                />
            </ChartBlock>
        </div>
    );
}

function UptimeStrip({ history }: { history: History }) {
    const spansDays = history.range === '7d';

    return (
        <div className='mon:flex mon:h-6 mon:gap-px' aria-label='Uptime'>
            {history.points.map((point) => {
                const colour = point.up === null ? 'mon:bg-muted' : point.up >= 1 ? 'mon:bg-success' : point.up > 0 ? 'mon:bg-warning' : 'mon:bg-destructive';
                const label = point.up === null ? 'No data' : `${Math.round(point.up * 100)}% online`;

                return <div key={point.t} className={`mon:flex-1 mon:rounded-[1px] ${colour}`} title={`${formatTime(point.t, spansDays)}: ${label}`} />;
            })}
        </div>
    );
}
