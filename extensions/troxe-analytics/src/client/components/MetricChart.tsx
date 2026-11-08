import type { ReactNode } from 'react';
import AreaChart from './AreaChart';
import ChartBlock, { Swatch } from './ChartBlock';

/** Colours keyed by what a line means, so CPU is the same colour on every screen. */
export const COLOURS = Object.freeze({
    cpu: 'var(--chart-1)',
    cpuPeak: 'var(--chart-3)',
    memory: 'var(--chart-2)',
    memoryPeak: 'var(--chart-4)',
    disk: 'var(--chart-3)',
    load: 'var(--chart-5)',
    rx: 'var(--chart-4)',
    tx: 'var(--chart-5)',
    requests: 'var(--chart-1)',
    errors: 'var(--destructive)',
    servers: 'var(--chart-1)',
    running: 'var(--chart-2)',
    allocated: 'var(--chart-3)',
    events: 'var(--chart-2)',
});

/** One line of a chart: where its value comes from, and what to call it. */
export interface Line<TRow> {
    key: string;
    label: string;
    color: string;
    value: (row: TRow) => number | null;
}

interface Props<TRow> {
    title: string;
    info?: ReactNode;
    rows: readonly TRow[];
    times: (row: TRow) => number;
    lines: readonly Line<TRow>[];
    format: (value: number) => string;
    max?: number;
    height?: number;
    actions?: ReactNode;
    /** Extra legend entries typed by the screen, beside the automatic line swatches. */
    legendExtra?: ReactNode;
}

/**
 * A chart of stored history. A line whose value is null is drawn as a gap rather than as a
 * drop to zero, because "no sample in that bucket" and "measured at nothing" are different
 * statements and only the second one belongs on a graph.
 */
export default function MetricChart<TRow>({ title, info, rows, times, lines, format, max, height, actions, legendExtra }: Props<TRow>) {
    const points = rows.map(times);
    const legend = lines.length > 1 || legendExtra ? (
        <>
            {lines.length > 1 && lines.map((line) => <Swatch key={line.key} color={line.color} label={line.label} />)}
            {legendExtra}
        </>
    ) : undefined;

    return (
        <ChartBlock title={title} info={info} actions={actions} legend={legend}>
            {rows.length ? (
                <AreaChart
                    times={points}
                    series={lines.map((line) => ({ key: line.key, label: line.label, color: line.color, values: rows.map((row) => line.value(row)) }))}
                    max={max}
                    format={format}
                    height={height}
                />
            ) : (
                <div className='trx:flex trx:h-[180px] trx:items-center trx:justify-center trx:px-4 trx:text-sm trx:text-muted-foreground'>{title}: nothing stored in this window.</div>
            )}
        </ChartBlock>
    );
}
