/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import type { AxiosAdapter } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import { createExtensionTestHost, type ExtensionTestHost } from '@/sdk/testing';
import { registerClassicTheme } from './classic';
import { View } from './View';

/**
 * Recorded from a running panel: `GET /api/client/announcements` with one published
 * banner that requires an acknowledgement. The client shape is deliberately flat —
 * it is not the `{object, attributes}` envelope the admin resource uses — so the
 * mapping is pinned here against the bytes the server actually sends, not against a
 * hand-written stand-in that can quietly disagree with it.
 */
const livePayload = {
    data: [
        {
            id: 1,
            kind: 'success',
            title: 'Scheduled maintenance',
            body: 'The cluster restarts tonight at 02:00 UTC.',
            policy: 'once',
            require_ack: true,
            interval_hours: null,
            action_label: null,
            action_url: null,
            event_start: null,
            event_end: null,
            publish_at: '2026-11-05T12:41:13+02:00',
            expires_at: null,
            content_version: 1,
            interaction: null,
        },
    ],
};

let host: ExtensionTestHost | undefined;
let requests: { method: string; url: string }[] = [];
const realAdapter = http.defaults.adapter;

beforeAll(() => registerClassicTheme());

beforeEach(() => {
    requests = [];
    http.defaults.adapter = (async (config) => {
        const method = config.method ?? 'get';
        const url = config.url ?? '';

        requests.push({ method, url });

        if (method === 'get' && url === '/api/client/announcements') {
            return { data: livePayload, status: 200, statusText: 'OK', headers: {}, config };
        }

        return { data: '', status: 204, statusText: 'No Content', headers: {}, config };
    }) satisfies AxiosAdapter;
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
    http.defaults.adapter = realAdapter;
});

describe('dashboard.announcements contract', () => {
    it('renders the banner the live endpoint returns, and reports its impression by id', async () => {
        host = createExtensionTestHost({ path: '/' });

        await act(async () => {
            render(<View name='dashboard.announcements' />, { wrapper: host!.Wrapper });
        });

        expect(await screen.findByText('Scheduled maintenance')).toBeVisible();
        expect(screen.getByText('The cluster restarts tonight at 02:00 UTC.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Got it, acknowledge' })).toBeVisible();
        // `require_ack` with no acknowledgement yet, so the banner is never dismissible.
        expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();

        // The impression beacon carries the numeric id, which only holds if the
        // flat payload mapped onto the model.
        expect(requests).toContainEqual({ method: 'post', url: '/api/client/announcements/1/shown' });
    });
});
