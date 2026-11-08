import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createExtensionTestHost } from '@pterodactyl/sdk/testing';
import type { Point } from '../api';
import MetricChart, { COLOURS } from './MetricChart';
import { formatPercent } from '../lib/format';

let host: ReturnType<typeof createExtensionTestHost> | undefined;

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
});

const point = (over: Partial<Point>): Point => ({
    t: 1_762_281_600,
    samples: 60,
    cpu: 20,
    cpu_peak: 40,
    memory: 512,
    memory_peak: 700,
    disk: null,
    rx: 1024,
    tx: 2048,
    ...over,
});

const lines = [
    { key: 'cpu', label: 'mean', color: COLOURS.cpu, value: (row: Point) => row.cpu },
    { key: 'cpu_peak', label: 'peak', color: COLOURS.cpuPeak, value: (row: Point) => row.cpu_peak },
];

const draw = (rows: Point[]) =>
    render(<MetricChart title='Processor' rows={rows} times={(row) => row.t} lines={lines} format={formatPercent} />, {
        wrapper: (host = createExtensionTestHost({ extensionId: 'troxe-analytics' })).Wrapper,
    });

test('names every line it is about to draw', async () => {
    await draw([point({}), point({ t: 1_762_285_200, cpu: 30, cpu_peak: 55 })]);

    expect(await screen.findByText('Processor')).toBeTruthy();
    expect(screen.getAllByText('mean').length).toBeGreaterThan(0);
    expect(screen.getAllByText('peak').length).toBeGreaterThan(0);
});

/** An empty window is a fact about storage, and it is said as one rather than drawn as a flat line at zero. */
test('says so when the window holds nothing', async () => {
    await draw([]);

    expect(await screen.findByText(/nothing stored in this window/)).toBeTruthy();
});
