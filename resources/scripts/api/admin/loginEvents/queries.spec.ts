/** @vitest-environment jsdom */

import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import {
    fetchAddressAccounts,
    fetchAdminLoginEvents,
    fetchAdminUserIpHistory,
    outcomeMeta,
    parseOutcome,
    type AddressAccountsResponse,
    type LoginEventListResponse,
    type LoginEventOutcome,
} from '@/api/admin/loginEvents/queries';

const emptyPage = {
    ip: '203.0.113.7',
    accounts: [],
    truncated: false,
} satisfies AddressAccountsResponse['data'];

describe('parseOutcome', () => {
    /**
     * These are the cases of `Pterodactyl\Enum\LoginEventOutcome`. A filter the server does not
     * know answers 422, so the URL parser has to agree with the enum or a bookmarked page breaks.
     */
    it('reads every outcome the recorder writes', () => {
        const outcomes: readonly LoginEventOutcome[] = [
            'success',
            'failed',
            'banned',
            'suspended',
            'throttled',
            'checkpoint',
        ];

        for (const outcome of outcomes) {
            expect(parseOutcome(outcome)).toBe(outcome);
        }
    });

    it('drops anything the recorder never writes', () => {
        expect(parseOutcome('accepted')).toBeUndefined();
        expect(parseOutcome('')).toBeUndefined();
        expect(parseOutcome(undefined)).toBeUndefined();
    });
});

describe('outcomeMeta', () => {
    it('says what each outcome means, in the same words the table reads', () => {
        expect(outcomeMeta('banned')).toMatchObject({ label: 'Banned', tone: 'danger' });
        expect(outcomeMeta('success')).toMatchObject({ label: 'Signed in', tone: 'success' });
        expect(outcomeMeta('checkpoint').detail).toContain('second factor');
    });
});

describe('the login-event endpoints', () => {
    const realAdapter = http.defaults.adapter;
    const emptyList: LoginEventListResponse = {
        object: 'list',
        data: [],
        meta: { pagination: { total: 0, count: 0, per_page: 50, current_page: 1, total_pages: 0 } },
    };
    let requestedUrl = '';

    beforeEach(() => {
        requestedUrl = '';

        http.defaults.adapter = (async (config) => {
            requestedUrl = `${config.url}`;
            const isAccountLookup = requestedUrl.includes('associated-accounts');

            return {
                data: isAccountLookup ? { data: emptyPage } : emptyList,
                status: 200,
                statusText: 'OK',
                headers: {},
                config,
            };
        }) satisfies AxiosAdapter;
    });

    afterEach(() => {
        http.defaults.adapter = realAdapter;
    });

    it('sends the address and the outcome as the filters the controller allows', async () => {
        await fetchAdminLoginEvents({ page: 3, ip: '203.0.113.7', outcome: 'failed', sort: '-created_at' });

        expect(requestedUrl).toContain('/api/admin/login-events?');
        expect(requestedUrl).toContain('page=3');
        expect(requestedUrl).toContain('per_page=50');
        expect(requestedUrl).toContain('filter%5Bip%5D=203.0.113.7');
        expect(requestedUrl).toContain('filter%5Boutcome%5D=failed');
        expect(requestedUrl).toContain('sort=-created_at');
    });

    it('leaves out the filters that were not asked for', async () => {
        await fetchAdminLoginEvents({ page: 1 });

        expect(requestedUrl).not.toContain('filter%5Bip%5D');
        expect(requestedUrl).not.toContain('filter%5Boutcome%5D');
        expect(requestedUrl).not.toContain('sort=');
    });

    /**
     * The per-account route is the one the tab is on, and it is scoped server-side to
     * `user_id`; the browser could ask for any account, so the URL is what carries the choice.
     */
    it('asks for one account, not for the whole history', async () => {
        await fetchAdminUserIpHistory(42, { page: 1, outcome: 'success' });

        expect(requestedUrl).toContain('/api/admin/users/42/ip-history?');
        expect(requestedUrl).toContain('filter%5Boutcome%5D=success');
    });

    it('sends the address to the account lookup as a plain ip parameter', async () => {
        const data = await fetchAddressAccounts('2001:db8::1');

        expect(requestedUrl).toContain('/api/admin/login-events/associated-accounts?ip=2001%3Adb8%3A%3A1');
        expect(data.ip).toBe('203.0.113.7');
        expect(data.truncated).toBe(false);
    });
});
