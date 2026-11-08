import { afterEach, beforeAll, expect, test } from 'vitest';
import { act } from 'react';
import { Button, mbToBytes } from '@pterodactyl/sdk';
import {
    createTestServer,
    createTestServerCard,
    preloadTheme,
    renderView,
    renderWithTheme,
    type RenderedView,
} from '@pterodactyl/sdk/testing';
import type { ServerListItem, ServerListModel } from '@pterodactyl/sdk/theme';
import { meterPercent, summarize } from './views/Overview/summary';
import theme from './theme';

const themes = [theme];

const item = (n: number): ServerListItem => {
    const card = { identifier: `s${n}`, uuid: `11111111-1111-4111-8111-00000000000${n}`, name: `Server ${n}` };

    return { ...createTestServerCard(card), server: createTestServer(card) };
};

const serverListFixture: ServerListModel = {
    servers: [item(1), item(2)],
    totals: { servers: 2, runningOnPage: 2, offlineOnPage: 0 },
    loading: false,
    pagination: { total: 2, count: 2, perPage: 50, currentPage: 1, totalPages: 1 },
    scope: 'mine',
    canViewOthers: false,
    canCreateServers: false,
    actions: { setPage: () => undefined, setScope: () => undefined },
};

let rendered: RenderedView | undefined;

// Loads the chunks of views declared with lazyView, so renderView renders them at once.
beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

test('frames the classic app layout', () => {
    rendered = renderView('layout.app', { themes, fixture: 'admin' });

    expect(rendered.container.querySelector('[data-troxe-layout] main')).not.toBeNull();
});

test('steps the page aside while the drawer is open, and back when it closes', () => {
    rendered = renderView('layout.app', { themes, fixture: 'admin' });

    const toggle = rendered.container.querySelector<HTMLButtonElement>('button[aria-controls="troxe-nav"]')!;
    const page = rendered.container.querySelector<HTMLElement>('[data-troxe-layout] main')!.parentElement!;
    const tabs = rendered.container.querySelector<HTMLElement>('nav[aria-label="Primary"]')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(page.hasAttribute('inert')).toBe(false);

    act(() => toggle.click());

    // Nothing traps focus: the dimmed page and the tab bar drop out of the tab order, and the header
    // keeps the same button as the way back out.
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close navigation');
    expect(page.hasAttribute('inert')).toBe(true);
    expect(tabs.hasAttribute('inert')).toBe(true);

    act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(page.hasAttribute('inert')).toBe(false);
    expect(tabs.hasAttribute('inert')).toBe(false);
});

test('lists a server area in the rail, with a way back out', () => {
    rendered = renderView('layout.app', { themes, fixture: 'serverArea' });

    const rail = rendered.container.querySelector('#troxe-nav');
    expect(rail?.textContent).toContain('Survival');
    expect(rail?.textContent).toContain('Back to Dashboard');
    expect([...rail!.querySelectorAll('section[aria-label="Server navigation"] a')].map((a) => a.textContent)).toEqual([
        'Back to Dashboard',
        'Console',
        'Files',
        'Databases',
        'Schedules',
        'Users',
        'Backups',
        'Network',
        'Startup',
        'Settings',
        'Activity',
    ]);
    // The areas the rail is not already inside stay one row away.
    expect([...rail!.querySelectorAll('nav[aria-label=Main] a')].map((a) => a.textContent)).toEqual([
        'Account Settings',
    ]);
});

test('leaves the area navigation to the rail', () => {
    rendered = renderView('layout.server', { themes, fixture: 'admin' });

    expect(rendered.container.textContent).toBe('');
});test('draws buttons as the console kit pills', () => {
    rendered = renderWithTheme(<Button>Save</Button>, { themes });

    expect(rendered.container.querySelector('button')?.className).toContain('rounded-full');
});

test('lays the console out with the product console kit', () => {
    rendered = renderView('page.server.console', { themes });

    const console_ = rendered.container.querySelector('section[aria-label=Console]');
    expect(console_?.className).toContain('troxe-card');
    expect(console_?.textContent).toContain('Connected');
    expect(rendered.container.textContent).toContain('Disconnecting never stops the server');

    const meters = rendered.container.querySelectorAll('[role=progressbar]');
    expect([...meters].map((m) => m.getAttribute('aria-label'))).toEqual(['CPU', 'Memory', 'Disk']);
    expect(rendered.container.textContent).toContain('Min');
    expect(rendered.container.textContent).toContain('Server Information');
});

// The Overview reads the same limits the server cards do; a unit slip there shows up here as a wrong total.
test('draws the Overview tiles and the usage panel', () => {
    rendered = renderView('dashboard.serverList', { themes, fixture: 'servers' });

    const text = rendered.container.textContent ?? '';
    expect(text).toContain('Servers');
    expect(text).toContain('Usage across your servers');
    expect(text).toMatch(/of \d+(\.\d+)? GiB/);
    expect(text).not.toMatch(/of \d+(\.\d+)? MiB/);
});

test('adds the plan and the readings up in the units the panel reports', () => {
    const summary = summarize(serverListFixture);

    expect(summary.servers).toBe(2);
    expect(summary.running).toBe(2);
    // Both limits are megabytes, as the server cards read them, so two of each add up the same way.
    expect(summary.memory.allowed).toBe(2 * mbToBytes(1024));
    expect(summary.disk.allowed).toBe(2 * mbToBytes(1024));
    expect(summary.cpuAllowed).toBe(200);
    expect(summary.memory.used).toBe(2 * 256 * 1024 ** 2);
    expect(meterPercent(summary.memory.used, summary.memory.allowed)).toBe(25);
});
