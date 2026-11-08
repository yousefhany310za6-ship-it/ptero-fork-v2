/** @vitest-environment jsdom */

import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import {
    fetchSuspensions,
    fetchUserSuspensions,
    serverSuspensionOutcomeMeta,
    suspendFormDefaults,
    suspendToRequestBody,
    suspensionReasonLabel,
    suspensionStatusMeta,
    type SuspendFormValues,
    type UserSuspensionListResponse,
} from '@/api/admin/users/suspensions';

const form: SuspendFormValues = {
    reason: 'abuse_of_service',
    message: '  files were being shared from this account  ',
    internalNote: '  ticket #402 attached  ',
    duration: 'permanent',
    expiresAt: '',
    acknowledgeLockout: false,
};

const emptyList: UserSuspensionListResponse = {
    object: 'list',
    data: [],
    meta: { pagination: { total: 0, count: 0, per_page: 50, current_page: 1, total_pages: 0 } },
};

describe('suspendToRequestBody', () => {
    it('trims what the account reads and what the administrators keep', () => {
        const body = suspendToRequestBody(form);

        expect(body.message).toBe('files were being shared from this account');
        expect(body.internal_note).toBe('ticket #402 attached');
    });

    it('sends a blank note as null, so nothing is stored as an empty string', () => {
        expect(suspendToRequestBody({ ...form, internalNote: '   ' }).internal_note).toBeNull();
    });

    it('sends no end date for a permanent suspension, even if the field still holds text', () => {
        const body = suspendToRequestBody({ ...form, duration: 'permanent', expiresAt: '2026-12-01T09:30' });

        expect(body.expires_at).toBeNull();
        expect(body.reason).toBe('abuse_of_service');
    });

    /**
     * The dialog's field is a `datetime-local` value, which the browser reads in the machine's own
     * zone. Sending the instant it means — not the text — is what keeps the end date the same moment
     * for the server that stores it.
     */
    it('converts a temporary end date to the instant the browser meant', () => {
        const body = suspendToRequestBody({ ...form, duration: 'temporary', expiresAt: '2026-12-01T09:30' });

        expect(body.expires_at).not.toBeNull();
        expect(new Date(body.expires_at ?? '').getTime()).toBe(new Date('2026-12-01T09:30').getTime());
    });

    it('passes the lockout confirmation through untouched', () => {
        expect(suspendToRequestBody({ ...form, acknowledgeLockout: true }).acknowledge_lockout).toBe(true);
    });

    it('opens on a reason, a permanent span and no note', () => {
        expect(suspendFormDefaults).toMatchObject({ reason: 'suspicious_activity', duration: 'permanent' });
    });
});

describe('suspension labels', () => {
    it('names every stored reason in the words the dialog offers', () => {
        expect(suspensionReasonLabel('terms_of_service_violation')).toBe('Terms of Service violation');
        expect(suspensionReasonLabel('other')).toBe('Other');
    });

    /** A value the panel added after this build is shown rather than hidden. */
    it('shows an unrecognised reason as it arrived', () => {
        expect(suspensionReasonLabel('chargeback' as never)).toBe('chargeback');
    });

    /** "Expired" and "lifted" read differently because only one of them was decided by a person. */
    it('separates an elapsed end date from a lifted record', () => {
        expect(suspensionStatusMeta('expired').label).toBe('Expired');
        expect(suspensionStatusMeta('lifted').label).toBe('Lifted');
        expect(suspensionStatusMeta('active').label).toBe('Suspended');
    });

    it('says what happened to a server rather than hiding the refusal', () => {
        expect(serverSuspensionOutcomeMeta('failed').tone).toBe('danger');
        expect(serverSuspensionOutcomeMeta('deferred').label).toBe('Deferred');
        expect(serverSuspensionOutcomeMeta('already_suspended').label).toBe('Already stopped');
    });
});

describe('fetching suspension records', () => {
    const realAdapter = http.defaults.adapter;
    let requestedUrl = '';

    beforeEach(() => {
        requestedUrl = '';
        http.defaults.adapter = (async (config) => {
            requestedUrl = `${config.url}`;

            return { data: emptyList, status: 200, statusText: 'OK', headers: {}, config };
        }) satisfies AxiosAdapter;
    });

    afterEach(() => {
        http.defaults.adapter = realAdapter;
    });

    it("lists one account's history newest-first with a page size the screen owns", async () => {
        await fetchUserSuspensions(7, { page: 1, perPage: 50, sort: '-created_at' });

        expect(requestedUrl).toContain('/api/admin/users/7/suspensions?');
        expect(requestedUrl).toContain('page=1');
        expect(requestedUrl).not.toContain('/api/admin/suspensions?');
        expect(requestedUrl).toContain('sort=-created_at');
    });

    it('defaults the page size to the whole short history of one account', async () => {
        await fetchUserSuspensions(7, { page: 1 });

        expect(requestedUrl).toContain('per_page=50');
    });

    it('sends the case reference and the account as filters, not as path segments', async () => {
        await fetchSuspensions({ page: 1, supportCaseId: 'A7K2P9', userId: 12, status: 'active' });

        expect(requestedUrl).toContain('/api/admin/suspensions?');
        expect(requestedUrl).toContain('filter%5Bsupport_case_id%5D=A7K2P9');
        expect(requestedUrl).toContain('filter%5Buser_id%5D=12');
        expect(requestedUrl).toContain('filter%5Bstatus%5D=active');
    });

    it('leaves out the filters that were not asked for', async () => {
        await fetchSuspensions({ page: 3 });

        expect(requestedUrl).toContain('page=3');
        expect(requestedUrl).not.toContain('filter%5Bsupport_case_id%5D');
        expect(requestedUrl).not.toContain('filter%5Buser_id%5D');
        expect(requestedUrl).not.toContain('filter%5Bstatus%5D');
        expect(requestedUrl).not.toContain('sort=');
    });
});
