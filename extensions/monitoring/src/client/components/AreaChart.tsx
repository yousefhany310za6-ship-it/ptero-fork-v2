import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatTime } from '../lib/format';

export interface Series {
    key: string;
    label: string;
    color: string;
    values: (number | null)[];
}

interface Props {
    times: number[];
    series: Series[];
    max?: number;
    format: (value: number) => string;
    height?: number;
}

const AXIS = 64;
const TOP = 8;

/** A static area chart drawn like the console graphs, with a hover readout. */
export default function AreaChart({ times, series, max, format, height = 180 }: Props) {
    const uid = useId().replaceAll(':', '');
    const container = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [hover, setHover] = useState<number | null>(null);

    useLayoutEffect(() => {
        const element = container.current;

        if (!element) {
            return;
        }

        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(element);
        setWidth(element.clientWidth);

        return () => observer.disconnect();
    }, []);

    const top = useMemo(() => {
        const highest = Math.max(0, ...series.flatMap((item) => item.values.filter((value): value is number => value !== null)));

        return Math.max(max ?? 0, highest * 1.1) || 1;
    }, [series, max]);

    const plot = Math.max(0, width - AXIS - 8);
    const inner = height - TOP - 4;
    const x = (index: number) => AXIS + (times.length <= 1 ? plot : (index / (times.length - 1)) * plot);
    const y = (value: number) => TOP + inner - (Math.min(value, top) / top) * inner;
    const spansDays = times.length > 1 && times[times.length - 1] - times[0] > 86400;

    const paths = series.map((item) => {
        const segments: string[][] = [];
        let current: string[] = [];

        item.values.forEach((value, index) => {
            if (value === null) {
                current.length && segments.push(current);
                current = [];
            } else {
                current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
            }
        });
        current.length && segments.push(current);

        return {
            ...item,
            line: segments.map((points) => `M${points.join('L')}`).join(''),
            area: segments.map((points) => `M${points[0].split(',')[0]},${TOP + inner}L${points.join('L')}L${points[points.length - 1].split(',')[0]},${TOP + inner}Z`).join(''),
        };
    });

    const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
        const left = event.clientX - event.currentTarget.getBoundingClientRect().left - AXIS;
        setHover(times.length ? Math.max(0, Math.min(times.length - 1, Math.round((left / plot) * (times.length - 1)))) : null);
    };

    return (
        <div ref={container} className='mon:relative' style={{ height }}>
            {width > 0 && (
                <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role='img' aria-label={series.map((item) => item.label).join(', ')}>
                    <defs>
                        {series.map((item) => (
                            <linearGradient key={item.key} id={`${uid}-${item.key}`} x1='0' y1='0' x2='0' y2='1'>
                                <stop offset='0%' stopColor={item.color} stopOpacity={0.45} />
                                <stop offset='100%' stopColor={item.color} stopOpacity={0} />
                            </linearGradient>
                        ))}
                    </defs>
                    {[0, 0.5, 1].map((step) => (
                        <g key={step}>
                            <line x1={AXIS} x2={AXIS + plot} y1={y(top * step)} y2={y(top * step)} stroke='var(--border)' />
                            <text x={AXIS - 8} y={y(top * step) + 4} textAnchor='end' fill='var(--muted-foreground)' fontSize={12}>
                                {format(top * step)}
                            </text>
                        </g>
                    ))}
                    {paths.map((item) => (
                        <g key={item.key}>
                            <path d={item.area} fill={`url(#${uid}-${item.key})`} />
                            <path d={item.line} fill='none' stroke={item.color} strokeWidth={2} strokeLinejoin='round' />
                        </g>
                    ))}
                    {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + inner} stroke='var(--muted-foreground)' strokeDasharray='3 3' />}
                </svg>
            )}
            {hover !== null && (
                <div
                    className='mon:pointer-events-none mon:absolute mon:top-1 mon:rounded-sm mon:border mon:border-border mon:bg-popover mon:px-2 mon:py-1 mon:text-xs mon:shadow-lg'
                    style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
                >
                    <p className='mon:text-muted-foreground'>{formatTime(times[hover], spansDays)}</p>
                    {series.map((item) => (
                        <p key={item.key} className='mon:whitespace-nowrap mon:text-foreground'>
                            {series.length > 1 && `${item.label}: `}
                            {item.values[hover] === null ? 'No data' : format(item.values[hover]!)}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
