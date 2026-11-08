import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createExtensionTestHost } from '@pterodactyl/sdk/testing';
import type { AdminMonitoring, Capacity, NodeHealth } from '../api';
import OverviewWidget from '../components/OverviewWidget';
import AdminScreen from './AdminScreen';

const { memory, disk, node, headline } = vi.hoisted(() => {
    const memory: Capacity = {
        total: 128000,
        host: true,
        segments: [
            { key: 'servers', mib: 57344, percent: 44.8 },
            { key: 'other', mib: 40656, percent: 31.8 },
            { key: 'free', mib: 30000, percent: 23.4 },
        ],
        allocated: 358400,
        allowed: 786432,
        overallocate: 500,
        left: 428032,
        unlimited: 0,
        warnings: ['physical'],
    };

    const disk: Capacity = {
        total: 898048,
        host: false,
        segments: [
            { key: 'servers', mib: 107520, percent: 12 },
            { key: 'unused', mib: 790528, percent: 88 },
        ],
        allocated: 700784,
        allowed: 5388288,
        overallocate: 500,
        left: 4687504,
        unlimited: 0,
        warnings: [],
    };

    const node: NodeHealth = {
        id: 1,
        name: 'A node with a really long name that should truncate',
        reachable: true,
        error: null,
        down_since: null,
        version: '1.13.3',
        latest: '1.13.3',
        os: 'Ubuntu 25.04',
        cpu_threads: 16,
        containers: { total: 20, running: 12 },
        servers: { running: 12, total: 20 },
        panel_host: true,
        memory,
        disk,
        cpu: { threads: 16, used: 2.3, allocated: 24, unlimited: 3, percent: 14.4 },
    };

    const headline = {
        servers: { running: 12, total: 20 },
        nodes: { reachable: 1, total: 1 },
        alerts: 0,
        scheduler: { at: new Date().toISOString(), ok: true },
        queue: { at: new Date().toISOString(), ok: true },
        failed_jobs: 0,
    };

    return { memory, disk, node, headline };
});

// The test host has no extension screens to link to.
vi.mock('@pterodactyl/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@pterodactyl/sdk')>()),
    PanelLink: ({ children, className }: { children: React.ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));

vi.mock('../api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../api')>()),
    getAdmin: vi.fn().mockResolvedValue({
        health: {
            ...headline,
            interval: 5,
            queues: { high: 0, standard: 2, low: 0 },
            versions: { panel: '2.0.0', php: '8.4.5', database: 'MariaDB 11.4.7', database_full: '11.4.7-MariaDB-0ubuntu0.25.04.1', redis: '7.4.2' },
            host: { load: [0.5, 0.6, 0.7], cpus: 16, memory: { used: 1, total: 2, container: true }, disk: { total: 100, free: 40 }, uptime: 90000 },
            node_list: [node],
        },
        rules: [],
        alerts: [],
        channels: [],
    } satisfies AdminMonitoring),
    getSummary: vi.fn().mockResolvedValue({
        ...headline,
        capacity: [{ id: 1, name: 'Main', reachable: true, panel_host: true, memory, disk }],
    }),
}));

let host: ReturnType<typeof createExtensionTestHost> | undefined;

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
});

function renderWithHost(element: React.ReactElement) {
    host = createExtensionTestHost({ extensionId: 'monitoring', prefix: 'mon' });
    render(element, { wrapper: host.Wrapper });
}

test('shortens the database version and keeps the full one on hover', async () => {
    renderWithHost(<AdminScreen />);

    const database = await screen.findByText('MariaDB 11.4.7');

    expect(database.getAttribute('title')).toBe('11.4.7-MariaDB-0ubuntu0.25.04.1');
    expect(database.className).toContain('mon:truncate');
    expect(screen.getByText('high 0')).toBeTruthy();
});

test('shows the capacity of each node', async () => {
    renderWithHost(<AdminScreen />);

    expect(await screen.findByText('Runs the panel')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Memory: Servers 56 GiB/ })).toBeTruthy();
    expect(screen.getByText('Allocated 684 GiB of 5.1 TiB allowed (500% overallocation) · 4.5 TiB left to allocate')).toBeTruthy();
    expect(screen.getByText('CPU · Servers use 2.3 of 16 threads · 24 threads allocated · 3 servers without a limit')).toBeTruthy();
    expect(screen.getByText("Disk usage outside Pterodactyl is unknown: the panel cannot see this node's disk.")).toBeTruthy();
});

test('the overview widget shows compact capacity', async () => {
    renderWithHost(<OverviewWidget />);

    expect(await screen.findByText('Node capacity')).toBeTruthy();
    expect(screen.getByText('350 / 768 GiB allocated').parentElement?.textContent).toBe('350 / 768 GiB allocated · 418 GiB left');
    expect(screen.getByText('Free or not measured')).toBeTruthy();
});
