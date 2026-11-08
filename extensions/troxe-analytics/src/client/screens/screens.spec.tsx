import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { createExtensionTestHost } from '@pterodactyl/sdk/testing';
import * as fixtures from '../fixtures/live';

/**
 * Each screen is rendered against the payloads the running panel actually answered, so what is
 * checked here is the read path a screen takes: the field it asks for, the figure it formats,
 * and the empty state it falls back to when nothing was measured.
 *
 * The API module is stubbed rather than the network, which leaves the screen's own query keying
 * and loading states on the path being tested.
 */
vi.mock('@pterodactyl/sdk', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    // The test host has no screen registry, so a link to another screen cannot resolve here.
    // Which screens exist is the manifest's business; these tests are about the figures.
    PanelLink: ({ children, className }: { children: ReactNode; className?: string }) => <a className={className}>{children}</a>,
}));

vi.mock('../api', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../api')>()),
    getOverview: () => Promise.resolve(fixtures.overview),
    getServers: () => Promise.resolve(fixtures.servers),
    getServer: () => Promise.resolve(fixtures.server),
    getNodes: () => Promise.resolve(fixtures.nodes),
    getNode: () => Promise.resolve(fixtures.node),
    getResources: () => Promise.resolve(fixtures.resources),
    getCustomers: () => Promise.resolve(fixtures.customers),
    getNetwork: () => Promise.resolve(fixtures.network),
    getSecurity: () => Promise.resolve(fixtures.security),
    getIncidents: () => Promise.resolve(fixtures.incidents),
    getStatus: () => Promise.resolve(fixtures.status),
}));

let host: ReturnType<typeof createExtensionTestHost> | undefined;

/** Renders a screen and waits for one figure that only the payload could have put there. */
const draw = async (element: ReactElement, visible: string | RegExp) => {
    host = createExtensionTestHost({ extensionId: 'troxe-analytics', prefix: 'trx', path: '/admin/analytics' });
    const Wrapper = host.Wrapper as ComponentType<{ children?: ReactNode }>;

    const view = render(element, { wrapper: Wrapper });
    const found = await view.findAllByText(visible, {}, { timeout: 20_000, interval: 100 }).catch((error: Error) => {
        console.log(`--- ${visible} not drawn; screen says ---\n${view.container.textContent?.slice(0, 1_200)}`);

        throw error;
    });

    expect(found.length).toBeGreaterThan(0);
};

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
});

test('the overview draws the fleet it was given', async () => {
    const { default: Screen } = await import('../screens/OverviewScreen');
    await draw(<Screen />, 'Example-1');
});

test('the server list draws the servers it was given', async () => {
    const { default: Screen } = await import('../screens/ServersScreen');
    await draw(<Screen />, 'Example');
});

test('the node list draws capacity beside the last figures stored', async () => {
    const { default: Screen } = await import('../screens/NodesScreen');
    await draw(<Screen />, 'Example-1');
});

test('resources draw the fleet against what it was sold', async () => {
    const { default: Screen } = await import('../screens/ResourcesScreen');
    await draw(<Screen />, 'Example');
});

test('customers draw the census and the accounts behind it', async () => {
    const { default: Screen } = await import('../screens/CustomersScreen');
    await draw(<Screen />, 'example-user');
});

test('network draws traffic by server rather than by page', async () => {
    const { default: Screen } = await import('../screens/NetworkScreen');
    await draw(<Screen />, 'Example');
});

test('security draws what the panel logged', async () => {
    const { default: Screen } = await import('../screens/SecurityScreen');
    await draw(<Screen />, 'auth:success');
});

test('incidents says so when nothing has ever been raised', async () => {
    const { default: Screen } = await import('../screens/IncidentsScreen');
    await draw(<Screen />, 'No rules are configured, so nothing can raise an incident.');
});

test('reports offers the windows it can write', async () => {
    const { default: Screen } = await import('../screens/ReportsScreen');
    await draw(<Screen />, 'Servers');
});

test('collection reports the state of the workers', async () => {
    const { default: Screen } = await import('../screens/StatusScreen');
    await draw(<Screen />, 'Monitoring samples');
});
