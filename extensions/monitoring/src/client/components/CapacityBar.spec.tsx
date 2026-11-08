import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createExtensionTestHost } from '@pterodactyl/sdk/testing';
import type { Capacity } from '../api';
import CapacityBar, { CompactCapacity } from './CapacityBar';

let host: ReturnType<typeof createExtensionTestHost> | undefined;

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
});

const panelHost: Capacity = {
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

const remote: Capacity = {
    total: 10240,
    host: false,
    segments: [
        { key: 'servers', mib: 2048, percent: 20 },
        { key: 'unused', mib: 8192, percent: 80 },
    ],
    allocated: 4096,
    allowed: 10240,
    overallocate: 0,
    left: 6144,
    unlimited: 2,
    warnings: [],
};

function renderWithHost(element: React.ReactElement) {
    host = createExtensionTestHost({ extensionId: 'monitoring', prefix: 'mon' });

    return render(element, { wrapper: host.Wrapper });
}

test('stacks servers and everything else with a legend, allocation line and warning', async () => {
    const { container } = renderWithHost(<CapacityBar label='Memory' capacity={panelHost} />);

    const bar = await screen.findByRole('img', { name: 'Memory: Servers 56 GiB (44.8%), Everything else 40 GiB (31.8%), Free 29 GiB (23.4%) of 125 GiB' });
    const segments = [...bar.querySelectorAll<HTMLElement>('[data-segment]')];

    expect(segments.map((segment) => [segment.dataset.segment, segment.style.width])).toEqual([
        ['servers', '44.8%'],
        ['other', '31.8%'],
    ]);
    expect(screen.getByText('Everything else')).toBeTruthy();
    expect(screen.getByText('29 GiB')).toBeTruthy();

    const allocation = screen.getByText('Allocated 350 GiB of 768 GiB allowed (500% overallocation) · 418 GiB left to allocate');
    expect(allocation.className).toContain('mon:text-warning');
    expect(screen.getByText('Allocated more than the node has (125 GiB)')).toBeTruthy();
    expect(container.textContent).toContain('125 GiB total');
});

test('without host usage shows servers against the node only', async () => {
    renderWithHost(<CapacityBar label='Disk' capacity={remote} />);

    const bar = await screen.findByRole('img', { name: /^Disk: Servers 2\.0 GiB \(20%\), Not used by servers 8\.0 GiB \(80%\) of 10 GiB$/ });

    expect(bar.querySelectorAll('[data-segment]')).toHaveLength(1);
    expect(screen.queryByText('Everything else')).toBeNull();
    expect(screen.getByText('Not used by servers')).toBeTruthy();

    const allocation = screen.getByText('Allocated 4.0 GiB of 10 GiB allowed · 6.0 GiB left to allocate · 2 servers without a limit');
    expect(allocation.className).toContain('mon:text-muted-foreground');
    expect(screen.queryByText(/more than|Less than/)).toBeNull();
});

test('warns when running low or over the limit', async () => {
    renderWithHost(<CapacityBar label='Memory' capacity={{ ...remote, allocated: 11000, left: -760, warnings: ['physical', 'low'] }} />);

    expect(await screen.findByText(/760 MiB over the limit/)).toBeTruthy();
    expect(screen.getByText('Allocated more than the node has (10 GiB) · Over what the node allows')).toBeTruthy();
});

test('compact form shows short numbers and the details on hover', async () => {
    const { container } = renderWithHost(<CompactCapacity label='Memory' capacity={panelHost} />);

    expect((await screen.findByText('350 / 768 GiB allocated')).parentElement?.textContent).toBe('350 / 768 GiB allocated · 418 GiB left');
    expect(screen.getByRole('img', { name: /^Memory: Servers 56 GiB/ })).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).title).toContain('500% overallocation');
});
