/** @vitest-environment jsdom */

import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import {
    announcementFormDefaults,
    announcementToRequestBody,
    fetchAnnouncementStats,
    type AnnouncementAttributes,
    type AnnouncementFormValues,
    type AnnouncementStats,
} from '@/api/admin/announcements/queries';

const fullForm: AnnouncementFormValues = {
    name: '  release-notes  ',
    title: ' Patch ',
    body: 'Line one\nLine two with <b>markup</b> kept as text.',
    kind: 'info',
    policy: 'once',
    requireAck: false,
    intervalHours: '',
    audienceType: 'all',
    audienceUserIds: '',
    actionLabel: '',
    actionUrl: '   ',
    eventStart: '',
    eventEnd: '',
    publishAt: '',
    expiresAt: '',
};

const attributeOverrides = (over: Partial<AnnouncementAttributes>): AnnouncementAttributes => ({
    id: 1,
    name: 'n',
    title: 't',
    body: 'b',
    kind: 'info',
    status: 'draft',
    policy: 'once',
    require_ack: false,
    interval_hours: null,
    audience: { type: 'all' },
    action_label: null,
    action_url: null,
    event_start: null,
    event_end: null,
    publish_at: null,
    published_at: null,
    expires_at: null,
    content_version: 1,
    created_by: null,
    created_at: '2026-11-01T00:00:00+00:00',
    updated_at: '2026-11-01T00:00:00+00:00',
    ...over,
});

describe('announcementToRequestBody', () => {
    it('trims identifiers but keeps the body verbatim so line breaks survive', () => {
        const body = announcementToRequestBody(fullForm);

        expect(body.name).toBe('release-notes');
        expect(body.title).toBe('Patch');
        expect(body.body).toBe(fullForm.body);
    });

    it('blankToNull turns whitespace-only optional fields into null', () => {
        const body = announcementToRequestBody(fullForm);

        expect(body.action_url).toBeNull();
        expect(body.action_label).toBeNull();
        expect(body.event_start).toBeNull();
        expect(body.expires_at).toBeNull();
    });

    it('keeps the audience as { type: "all" } unless specific users are chosen', () => {
        expect(announcementToRequestBody(fullForm).audience).toEqual({ type: 'all' });
    });

    it('parses comma-separated user IDs, dropping anything not a finite number', () => {
        const body = announcementToRequestBody({
            ...fullForm,
            audienceType: 'users',
            audienceUserIds: ' 3, 7 , , abc, 12',
        });

        expect(body.audience).toEqual({ type: 'users', user_ids: [3, 7, 12] });
    });

    it('only sends interval_hours for the interval policy, defaulting a blank to 24', () => {
        const asInterval = announcementToRequestBody({ ...fullForm, policy: 'interval', intervalHours: '' });
        const asOnce = announcementToRequestBody({ ...fullForm, policy: 'once', intervalHours: '48' });

        expect(asInterval.interval_hours).toBe(24);
        expect(asInterval.interval_hours).not.toBeNull();
        expect(asOnce.interval_hours).toBeNull();
    });

    it('carries require_ack straight through', () => {
        const body = announcementToRequestBody({ ...fullForm, requireAck: true });

        expect(body.require_ack).toBe(true);
    });
});

describe('announcementFormDefaults', () => {
    it('returns a blank form when there is no announcement', () => {
        const values = announcementFormDefaults();

        expect(values.name).toBe('');
        expect(values.audienceType).toBe('all');
        expect(values.kind).toBe('info');
    });

    it('maps a users audience back into a comma-separated id string', () => {
        const values = announcementFormDefaults(
            attributeOverrides({ audience: { type: 'users', user_ids: [4, 9] }, interval_hours: 6, policy: 'interval' })
        );

        expect(values.audienceType).toBe('users');
        expect(values.audienceUserIds).toBe('4, 9');
        expect(values.intervalHours).toBe('6');
    });

    it('round-trips an announcement to a request body without losing targeting', () => {
        const attributes = attributeOverrides({
            audience: { type: 'users', user_ids: [2, 5] },
            policy: 'interval',
            interval_hours: 168,
            action_url: 'https://status.example.test',
        });

        const body = announcementToRequestBody(announcementFormDefaults(attributes));

        expect(body.audience).toEqual({ type: 'users', user_ids: [2, 5] });
        expect(body.interval_hours).toBe(168);
        expect(body.action_url).toBe('https://status.example.test');
    });
});

/**
 * Recorded from a running panel: `GET /api/admin/announcements/{id}/stats` answers with the
 * counters as they are. It is the one announcements endpoint with no `{object, attributes}`
 * envelope, so reading `.attributes` off it yields undefined and react-query rejects the whole
 * query — which is what the statistics dialog showed.
 */
const liveStats: AnnouncementStats = {
    content_version: 1,
    eligible: 2,
    shown: 0,
    acked: 0,
    dismissed: 0,
};

describe('fetchAnnouncementStats', () => {
    const realAdapter = http.defaults.adapter;

    beforeEach(() => {
        http.defaults.adapter = (async (config) => ({
            data: liveStats,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
        })) satisfies AxiosAdapter;
    });

    afterEach(() => {
        http.defaults.adapter = realAdapter;
    });

    it('reads the counters off the body itself', async () => {
        await expect(fetchAnnouncementStats(2)).resolves.toEqual(liveStats);
    });
});
