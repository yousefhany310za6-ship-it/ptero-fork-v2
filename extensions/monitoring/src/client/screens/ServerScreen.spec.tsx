import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createExtensionTestHost, createTestServer } from '@pterodactyl/sdk/testing';
import ServerScreen from './ServerScreen';

vi.mock('../api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../api')>()),
    getHistory: vi.fn().mockResolvedValue({
        range: '24h',
        interval: 5,
        points: [
            { t: 1_700_000_000, cpu: 12, memory: 900, disk: 270, rx: 100, tx: 50, up: 1 },
            { t: 1_700_000_300, cpu: 30, memory: 950, disk: 271, rx: 120, tx: 80, up: 1 },
        ],
        uptime: 99.5,
        limits: { cpu: 200, memory: 2048, disk: 10240 },
        current: null,
    }),
    getServer: vi.fn().mockResolvedValue({
        rules: [{ id: 1, metric: 'memory', threshold: 90, minutes: 5, cooldown: 60, enabled: true, channels: [], description: 'Memory above 90% for 5 min', owner: 'alex', mine: false }],
        alerts: [{ id: 3, rule: 'Memory above 90% for 5 min', metric: 'memory', global: false, server: null, node: null, value: 95, peak: 97.5, started_at: new Date().toISOString(), resolved_at: null, acknowledged_at: null }],
        channels: [],
        push: null,
    }),
}));

let host: ReturnType<typeof createExtensionTestHost> | undefined;

beforeAll(() => {
    globalThis.ResizeObserver ??= class {
        observe() {}
        disconnect() {}
        unobserve() {}
    } as unknown as typeof ResizeObserver;
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
});

function renderScreen(permissions: string[]) {
    host = createExtensionTestHost({ extensionId: 'monitoring', prefix: 'mon', server: createTestServer({ owner: false, permissions }) });
    render(<ServerScreen />, { wrapper: host.Wrapper });
}

test('shows uptime, charts, alerts and rules', async () => {
    renderScreen(['ext.monitoring.read', 'ext.monitoring.manage']);

    expect(await screen.findByText('99.50%')).toBeTruthy();
    expect(screen.getByText('CPU Load')).toBeTruthy();
    expect(await screen.findByText('97.5%')).toBeTruthy();
    expect(screen.getByText('Set up by alex')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as seen' })).toBeTruthy();
    expect(screen.getByText('Uptime Kuma')).toBeTruthy();
});

test('is read only without the manage permission', async () => {
    renderScreen(['ext.monitoring.read']);

    expect(await screen.findByText('97.5%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New rule' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).toBeNull();
    expect(screen.queryByText('Uptime Kuma')).toBeNull();
});
