/** @vitest-environment jsdom */
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicAnnouncement } from '@/api/client/announcements/queries';
import { useAnnouncementsModel } from './dashboard';
import type * as ServerQueries from '@/api/account/servers/queries';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@/sdk/testing';
import { registerClassicTheme } from './classic';
import { ViewFixtureProvider, View } from './View';
import { clearThemeLayers, registerViewLayer, type ViewProps } from './registry';

const useServerResourceUsage = vi.hoisted(() => vi.fn((_uuid: string, _enabled?: boolean) => ({ data: undefined })));

vi.mock('@/api/account/servers/queries', async (importOriginal) => ({
    ...(await importOriginal<typeof ServerQueries>()),
    useServerResourceUsage,
}));

const announcements = vi.hoisted(() => ({
    data: [] as PublicAnnouncement[],
    shown: vi.fn(),
    ack: vi.fn(),
    dismiss: vi.fn(),
}));

vi.mock('@/api/client/announcements/queries', () => ({
    useClientAnnouncements: () => ({ data: announcements.data }),
    useReportAnnouncementShown: () => ({ mutate: announcements.shown }),
    useAckAnnouncement: () => ({ mutate: announcements.ack, isPending: false }),
    useDismissAnnouncement: () => ({ mutate: announcements.dismiss, isPending: false }),
}));

const publicAnnouncement = (over: Partial<PublicAnnouncement> = {}): PublicAnnouncement => ({
    id: 1,
    kind: 'info',
    title: 'Welcome',
    body: 'Say hello.',
    policy: 'once',
    require_ack: false,
    interval_hours: null,
    action_label: null,
    action_url: null,
    event_start: null,
    event_end: null,
    publish_at: null,
    expires_at: null,
    content_version: 1,
    interaction: null,
    ...over,
});

let host: ExtensionTestHost | undefined;

beforeAll(() => registerClassicTheme());

beforeEach(() => {
    announcements.data = [];
    announcements.shown.mockReset();
    announcements.ack.mockReset();
    announcements.dismiss.mockReset();
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
    useServerResourceUsage.mockClear();
});

async function renderInApp(children: ReactNode) {
    host = createExtensionTestHost({ path: '/' });
    const { Wrapper } = host;

    await act(async () => {
        render(children, { wrapper: Wrapper });
    });
}

it('shows a maintenance badge instead of loading stats when the node is under maintenance', async () => {
    const server = createTestServer({ name: 'Survival' });

    await renderInApp(
        <View
            name='dashboard.serverCard'
            server={{ ...server, attributes: { ...server.attributes, is_node_under_maintenance: true } }}
        />
    );

    expect(await screen.findByText('Under Maintenance')).toBeVisible();
    expect(useServerResourceUsage).toHaveBeenCalledWith(server.attributes.uuid, false);
});

it('loads stats for a server on an available node', async () => {
    const server = createTestServer({ name: 'Survival' });

    await renderInApp(<View name='dashboard.serverCard' server={server} />);

    expect(await screen.findByText('Survival')).toBeVisible();
    expect(screen.queryByText('Under Maintenance')).not.toBeInTheDocument();
    expect(useServerResourceUsage).toHaveBeenCalledWith(server.attributes.uuid, true);
});

it('gives owners power actions from list data, which carries no per-server meta', async () => {
    registerViewLayer('theme', 'theme', {
        'dashboard.serverCard': ({ model }: ViewProps<'dashboard.serverCard'>) => (
            <span>start: {String(model.permissions.start)}</span>
        ),
    });
    const server = createTestServer({ name: 'Survival' });

    try {
        await renderInApp(
            <View
                name='dashboard.serverCard'
                server={{ ...server, meta: undefined, attributes: { ...server.attributes, server_owner: true } }}
            />
        );

        expect(await screen.findByText('start: true')).toBeVisible();
    } finally {
        clearThemeLayers();
    }
});

it('renders the classic server list from a fixture, with a link and power state per row', async () => {
    await renderInApp(
        <ViewFixtureProvider fixtures={{ 'dashboard.serverList': 'servers' }}>
            <View name='dashboard.serverList' />
        </ViewFixtureProvider>
    );

    const survival = await screen.findByRole('link', { name: 'Survival' });

    expect(survival).toHaveAttribute('href', '/server/a1b2c3d4');
    expect(survival).toHaveAttribute('data-status', 'success');
    expect(survival.querySelector('[data-part="status"]')).toHaveClass('bg-success');
    expect(screen.getByRole('link', { name: 'Creative' }).querySelector('[data-part="status"]')).toHaveClass(
        'bg-destructive'
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
});

it('shows the empty state and the dashboard error from fixtures', async () => {
    await renderInApp(
        <ViewFixtureProvider fixtures={{ 'dashboard.serverList': 'empty', 'page.dashboard': 'error' }}>
            <View name='dashboard.serverList' />
            <View name='page.dashboard' />
        </ViewFixtureProvider>
    );

    expect(await screen.findByText('No servers yet')).toBeVisible();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Request failed with status code 500.')).toBeVisible();
});

describe('dashboard.announcements', () => {
    it('maps the API to banner models and reports each impression once', async () => {
        announcements.data = [publicAnnouncement(), publicAnnouncement({ id: 2, title: 'Another' })];

        const { result } = renderHook(() => useAnnouncementsModel());

        await waitFor(() => expect(result.current.items).toHaveLength(2));
        expect(announcements.shown).toHaveBeenCalledTimes(2);

        // A refetch of the same banners must not re-report them.
        act(() => result.current.actions.acknowledge(1));
        await waitFor(() => expect(announcements.ack).toHaveBeenCalledWith(1));
        expect(announcements.shown).toHaveBeenCalledTimes(2);
    });

    it('records a dismissal and drops the banner from the model', async () => {
        announcements.data = [publicAnnouncement({ id: 3, title: 'Recurring', policy: 'every_visit' })];

        const { result } = renderHook(() => useAnnouncementsModel());

        await waitFor(() => expect(result.current.items).toHaveLength(1));
        act(() => {
            for (const item of result.current.items) {
                result.current.actions.dismiss(item);
            }
        });

        await waitFor(() => expect(announcements.dismiss).toHaveBeenCalledWith(3));
        expect(result.current.items).toHaveLength(0);
    });

    it('renders the banner stack from fixtures, without a backend', async () => {
        await renderInApp(
            <ViewFixtureProvider fixtures={{ 'dashboard.announcements': 'banners' }}>
                <View name='dashboard.announcements' />
            </ViewFixtureProvider>
        );

        expect(await screen.findByText('Scheduled maintenance')).toBeVisible();
        expect(screen.getByText('Acknowledge the outage notice')).toBeVisible();
        expect(screen.getByRole('alert')).toBeVisible();
        expect(screen.getAllByRole('button', { name: /dismiss/i })).toHaveLength(2);
    });
});
