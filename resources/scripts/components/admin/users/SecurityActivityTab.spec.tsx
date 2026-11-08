/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as loginEventsApi from '@/api/admin/loginEvents/queries';
import type { LoginEventItem } from '@/api/admin/loginEvents/queries';
import type * as userQueries from '@/api/admin/users/queries';
import type { AdminUserResource } from '@/api/extensionTypes';
import { ExtensionResourceProvider, type ExtensionResourceContext } from '@/extensions/resourceContext';
import SecurityActivityTab from './SecurityActivityTab';

/**
 * The part of the hook result the screen reads, spelled here rather than borrowed from `useQuery`
 * so a test can hand over an empty page without asserting its way through the type.
 */
interface AttemptsResult {
    data?: {
        data: LoginEventItem[];
        meta: { pagination: { total: number; count: number; per_page: number; current_page: number } };
    };
    error: Error | null;
    isFetching: boolean;
    refetch: () => void;
}

type AttemptsParams = Parameters<typeof loginEventsApi.useAdminUserIpHistory>;

let events: LoginEventItem[] = [];

const listAttempts = vi.fn((...params: AttemptsParams): AttemptsResult => ({
    data: {
        data: events,
        meta: {
            pagination: { total: events.length, count: events.length, per_page: 20, current_page: 1 },
        },
    },
    error: null,
    isFetching: false,
    refetch: () => void listAttempts(...params),
}));

vi.mock('@/api/admin/loginEvents/queries', async (importOriginal) => ({
    ...(await importOriginal<typeof loginEventsApi>()),
    useAdminUserIpHistory: (...params: AttemptsParams) => listAttempts(...params),
}));

vi.mock('@/api/admin/users/queries', async (importOriginal) => ({
    ...(await importOriginal<typeof userQueries>()),
    useAllAdminUsers: () => ({ data: [] }),
}));

/** The row fields the tab reads: the account state and two-factor, as the endpoints answer them. */
interface AdminUserFields {
    readonly '2fa'?: boolean;
    readonly account_status?: 'active' | 'suspended';
}

const account = (fields: AdminUserFields): AdminUserResource =>
    ({ object: 'user', attributes: { id: 7, email: 'alex@example.test', ...fields } }) as AdminUserResource;

const attempt = (overrides: Partial<LoginEventItem['attributes']> = {}): LoginEventItem => ({
    object: 'login_event',
    attributes: {
        id: 1,
        user_id: 7,
        user_uuid: null,
        username_attempted: 'alex',
        ip: '203.0.113.7',
        outcome: 'success',
        reason: null,
        ip_ban_id: null,
        suspension_case_id: null,
        user_agent: 'Firefox on Linux',
        fingerprint: null,
        created_at: '2026-11-04T09:12:00Z',
        ...overrides,
    },
});

/** Built per test, because the screen reads both the two-factor flag and the account state off the row. */
let context: ExtensionResourceContext = { kind: 'admin.user', resource: account({}) };

const renderTab = (attributes: AdminUserFields) => {
    context = { kind: 'admin.user', resource: account(attributes) };

    render(
        <ExtensionResourceProvider.Provider value={context}>
            <SecurityActivityTab />
        </ExtensionResourceProvider.Provider>
    );
};

describe('SecurityActivityTab', () => {
    afterEach(() => {
        cleanup();
        listAttempts.mockClear();
    });

    beforeEach(() => {
        events = [attempt()];
    });

    it('states the posture an administrator can act on, and who holds it', () => {
        renderTab({ '2fa': false, account_status: 'active' });

        expect(screen.getByText('Two-factor')).toBeInTheDocument();
        expect(screen.getByText('Not enabled')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows the account as closed, the way the account itself sees it', () => {
        renderTab({ '2fa': true, account_status: 'suspended' });

        expect(screen.getByText('Enabled')).toBeInTheDocument();
        expect(screen.getByText('Suspended')).toBeInTheDocument();
    });

    it('asks for the newest attempts of this account alone', () => {
        renderTab({ '2fa': false, account_status: 'active' });

        expect(listAttempts).toHaveBeenCalledWith(7, { page: 1, perPage: 20, sort: '-created_at' }, expect.anything());
    });

    it('names the suspension that refused an attempt, rather than leaving a bare failure', () => {
        events = [attempt({ outcome: 'suspended', suspension_case_id: 'A7K2P9', ip: null })];
        renderTab({ '2fa': false, account_status: 'suspended' });

        expect(screen.getByText('case A7K2P9')).toBeInTheDocument();
        expect(screen.getByText('no address recorded')).toBeInTheDocument();
    });

    it('names the address ban that refused an attempt', () => {
        events = [attempt({ outcome: 'banned', ip_ban_id: 14 })];
        renderTab({ '2fa': false, account_status: 'active' });

        expect(screen.getByText('ban #14')).toBeInTheDocument();
    });

    /** An attempt that got nowhere needs no column of blame. */
    it('leaves the refusal blank for an attempt nothing else stopped', () => {
        events = [attempt({ outcome: 'failed' })];
        renderTab({ '2fa': false, account_status: 'active' });

        expect(screen.queryByText(/case |ban #/)).not.toBeInTheDocument();
    });

    it('filters the attempts the way the server filters them, and starts the page over', async () => {
        renderTab({ '2fa': false, account_status: 'active' });

        await userEvent.selectOptions(screen.getByLabelText('Filter attempts by result'), 'banned');

        expect(listAttempts).toHaveBeenLastCalledWith(
            7,
            { page: 1, perPage: 20, outcome: 'banned', sort: '-created_at' },
            expect.anything()
        );
    });

    it('says so when nothing has been tried against the account', () => {
        events = [];
        renderTab({ '2fa': false, account_status: 'active' });

        expect(screen.getByText('No attempts to report')).toBeInTheDocument();
    });
});
