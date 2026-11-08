/** @vitest-environment jsdom */

import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from '@/api/http';
import {
    fetchAdminIpBans,
    ipBanToRequestBody,
    rangeStats,
    type IpBanFormValues,
    type IpBanListResponse,
} from '@/api/admin/ipBans/queries';

const fullForm: IpBanFormValues = {
    ip: '  203.0.113.7  ',
    reason: '  credential stuffing from this host  ',
    duration: 'permanent',
    expiresAt: '',
    acknowledgeBroad: false,
};

describe('rangeStats', () => {
    it('sizes a bare address as one host, in either family and in mapped notation', () => {
        expect(rangeStats('203.0.113.7')).toEqual({ hosts: 1n, isBroad: false });
        expect(rangeStats('2001:db8::1')).toEqual({ hosts: 1n, isBroad: false });
        expect(rangeStats('::ffff:203.0.113.7')).toEqual({ hosts: 1n, isBroad: false });
    });

    it('counts an IPv4 /24 as the 256 hosts it covers', () => {
        expect(rangeStats('198.51.100.0/24')).toEqual({ hosts: 256n, isBroad: false });
    });

    /**
     * The server refuses anything narrower than 2**16 hosts unless acknowledge_broad is set,
     * and a /16 is exactly 2**16. This is the boundary the PHP `MIN_UNCONFIRMED_PREFIX` of 112
     * puts in the normalised space; the dialog must agree with it or it invites a rejection.
     */
    it('puts the confirmation threshold on the same host count the server uses', () => {
        expect(rangeStats('198.18.0.0/16')).toEqual({ hosts: 65536n, isBroad: false });
        expect(rangeStats('198.16.0.0/15')).toEqual({ hosts: 131072n, isBroad: true });
        expect(rangeStats('2001:db8::/112')).toEqual({ hosts: 65536n, isBroad: false });
        expect(rangeStats('2001:db8::/111')).toEqual({ hosts: 131072n, isBroad: true });
    });

    it('reads an IPv4 prefix in the 128-bit space the bans are stored in', () => {
        expect(rangeStats('198.51.100.0/24').hosts).toBe(rangeStats('::ffff:198.51.100.0/120').hosts);
    });

    it('has nothing to report for an empty or unparseable prefix', () => {
        expect(rangeStats('')).toEqual({ hosts: null, isBroad: false });
        expect(rangeStats('   ')).toEqual({ hosts: null, isBroad: false });
        expect(rangeStats('203.0.113.7/33')).toEqual({ hosts: null, isBroad: false });
        expect(rangeStats('203.0.113.7/abc')).toEqual({ hosts: null, isBroad: false });
        expect(rangeStats('2001:db8::/129')).toEqual({ hosts: null, isBroad: false });
    });
});

describe('ipBanToRequestBody', () => {
    it('trims the address and the reason', () => {
        const body = ipBanToRequestBody(fullForm);

        expect(body.ip).toBe('203.0.113.7');
        expect(body.reason).toBe('credential stuffing from this host');
    });

    it('sends no end date for a permanent ban, even if the field still holds text', () => {
        const body = ipBanToRequestBody({ ...fullForm, duration: 'permanent', expiresAt: '2026-12-01T09:30' });

        expect(body.expires_at).toBeNull();
    });

    it('converts a temporary ban expiry to the instant the browser meant', () => {
        const body = ipBanToRequestBody({ ...fullForm, duration: 'temporary', expiresAt: '2026-12-01T09:30' });

        expect(body.expires_at).not.toBeNull();
        expect(new Date(body.expires_at ?? '').getTime()).toBe(new Date('2026-12-01T09:30').getTime());
    });

    it('passes the broad-range confirmation through untouched', () => {
        expect(ipBanToRequestBody({ ...fullForm, acknowledgeBroad: true }).acknowledge_broad).toBe(true);
    });
});

describe('fetchAdminIpBans', () => {
    const realAdapter = http.defaults.adapter;
    const emptyList: IpBanListResponse = {
        object: 'list',
        data: [],
        meta: { pagination: { total: 0, count: 0, per_page: 50, current_page: 1, total_pages: 0 } },
    };
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

    it('sends the covering-address lookup as filter[ip]', async () => {
        await fetchAdminIpBans({ page: 1, ip: '203.0.113.7' });

        expect(requestedUrl).toContain('/api/admin/ip-bans?');
        expect(requestedUrl).toContain('filter%5Bip%5D=203.0.113.7');
        expect(requestedUrl).toContain('per_page=50');
    });

    it('sends the state filter and the sort untouched', async () => {
        await fetchAdminIpBans({ page: 2, status: 'expired', sort: '-expires_at' });

        expect(requestedUrl).toContain('page=2');
        expect(requestedUrl).toContain('filter%5Bstatus%5D=expired');
        expect(requestedUrl).toContain('sort=-expires_at');
    });

    it('leaves out the filters that were not asked for', async () => {
        await fetchAdminIpBans({ page: 1 });

        expect(requestedUrl).not.toContain('filter%5Bip%5D');
        expect(requestedUrl).not.toContain('filter%5Bstatus%5D');
        expect(requestedUrl).not.toContain('sort=');
    });

    it('reads the paginated envelope the resource layer answers with', async () => {
        const spy = vi.fn(async () => emptyList);

        http.defaults.adapter = (async (config) => ({
            data: await spy(),
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
        })) satisfies AxiosAdapter;

        await expect(fetchAdminIpBans({ page: 1 })).resolves.toBe(emptyList);
    });
});
