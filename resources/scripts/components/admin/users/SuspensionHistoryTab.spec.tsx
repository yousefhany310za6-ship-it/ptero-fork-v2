/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as suspensionsApi from '@/api/admin/users/suspensions';
import type { UserSuspensionItem } from '@/api/admin/users/suspensions';
import type * as userQueries from '@/api/admin/users/queries';
import type { AdminUserResource } from '@/api/extensionTypes';
import { ExtensionResourceProvider, type ExtensionResourceContext } from '@/extensions/resourceContext';
import SuspensionHistoryTab from './SuspensionHistoryTab';

vi.mock('@/components/admin/users/EditSuspensionMessageDialog', () => ({
    default: ({ suspension }: { suspension: { support_case_id: string } }) => (
        <div role='dialog'>editing {suspension.support_case_id}</div>
    ),
}));

/**
 * The part of the hook result the screen reads, spelled here rather than borrowed from `useQuery`
 * so a test can hand over an unloaded query without asserting its way through the type.
 */
interface SuspensionListResult {
    data?: { data: UserSuspensionItem[] };
    error: Error | null;
    isFetching: boolean;
    refetch: () => void;
}

type SuspensionParams = Parameters<typeof suspensionsApi.useUserSuspensions>;

let rows: UserSuspensionItem[] = [];

const listSuspensions = vi.fn((...params: SuspensionParams): SuspensionListResult => ({
    data: { data: rows },
    error: null,
    isFetching: false,
    refetch: () => void listSuspensions(...params),
}));

vi.mock('@/api/admin/users/suspensions', async (importOriginal) => ({
    ...(await importOriginal<typeof suspensionsApi>()),
    useUserSuspensions: (...params: SuspensionParams) => listSuspensions(...params),
}));

vi.mock('@/api/admin/users/queries', async (importOriginal) => ({
    ...(await importOriginal<typeof userQueries>()),
    useAllAdminUsers: () => ({ data: [{ attributes: { id: 2, email: 'root@example.test', root_admin: true } }] }),
}));

const record = (overrides: Partial<UserSuspensionItem['attributes']> = {}): UserSuspensionItem => ({
    object: 'user_suspension',
    attributes: {
        id: 1,
        user_id: 7,
        support_case_id: 'A7K2P9',
        reason: 'abuse_of_service',
        status: 'active',
        message: 'Files were being shared from this account.',
        internal_note: 'Ticket #402 attached.',
        is_permanent: true,
        expires_at: null,
        created_by: 2,
        lifted_by: null,
        lifted_at: null,
        created_at: '2026-11-04T09:12:00Z',
        updated_at: '2026-11-04T09:12:00Z',
        servers: [
            { server_id: 11, server_uuid: 'abcd', outcome: 'suspended', wings_state_before: 'running', failure: null },
        ],
        ...overrides,
    },
});

const account = { object: 'user', attributes: { id: 7, email: 'alex@example.test' } } as AdminUserResource;

const context: ExtensionResourceContext = { kind: 'admin.user', resource: account };

const renderTab = () =>
    render(
        <ExtensionResourceProvider.Provider value={context}>
            <SuspensionHistoryTab />
        </ExtensionResourceProvider.Provider>
    );

describe('SuspensionHistoryTab', () => {
    afterEach(() => {
        cleanup();
        listSuspensions.mockClear();
    });

    beforeEach(() => {
        rows = [record()];
    });

    it('asks for the whole short history of one account rather than a page at a time', () => {
        renderTab();

        expect(listSuspensions).toHaveBeenCalledWith(7, { page: 1, perPage: 50 });
    });

    it('shows the message the account was given beside the reasoning that was not', () => {
        renderTab();

        expect(screen.getByText('A7K2P9')).toBeInTheDocument();
        expect(screen.getByText('Abuse of service')).toBeInTheDocument();
        expect(screen.getByText('Files were being shared from this account.')).toBeInTheDocument();
        expect(screen.getByText('note: Ticket #402 attached.')).toBeInTheDocument();
    });

    it('names the administrator who decided from the directory', () => {
        renderTab();

        expect(screen.getByText('root@example.test')).toBeInTheDocument();
    });

    it('falls back to the account id when nobody in the directory made the decision', () => {
        rows = [record({ created_by: 999 })];
        renderTab();

        expect(screen.getByText('an account no longer here')).toBeInTheDocument();
    });

    /** A record somebody closed is history, and the correction that would rewrite it is not offered. */
    it('closes the correction once a lifting has recorded it', () => {
        rows = [record({ status: 'lifted', lifted_at: '2026-11-05T10:00:00Z', lifted_by: 2 })];
        renderTab();

        expect(screen.getByText('Lifted')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /correct the message/i })).not.toBeInTheDocument();
    });

    it('offers the correction while the record is what the account is reading', async () => {
        renderTab();

        await userEvent.click(screen.getByRole('button', { name: 'Correct the message for support case A7K2P9' }));

        expect(screen.getByRole('dialog')).toHaveTextContent('editing A7K2P9');
    });

    /** A refusal to reach Wings is the one outcome that must not be buried among the servers that stopped. */
    it('puts the server it could not stop first, and says why', () => {
        rows = [
            record({
                servers: [
                    {
                        server_id: 12,
                        server_uuid: 'efgh',
                        outcome: 'suspended',
                        wings_state_before: 'running',
                        failure: null,
                    },
                    {
                        server_id: 11,
                        server_uuid: 'abcd',
                        outcome: 'failed',
                        wings_state_before: null,
                        failure: 'timeout',
                    },
                ],
            }),
        ];
        renderTab();

        expect(screen.getAllByText(/Failed|Stopped/).map((badge) => badge.textContent)[0]).toBe('Failed');
        expect(screen.getByText('Failed').closest('[title]')).toHaveAttribute('title', 'Failed: timeout');
    });

    it('says so when the account owned nothing to stop', () => {
        rows = [record({ servers: [] })];
        renderTab();

        expect(screen.getByText('owned no servers')).toBeInTheDocument();
    });

    it('describes an account that has never been closed', () => {
        rows = [];
        renderTab();

        expect(screen.getByText(/Nothing has ever closed this account/)).toBeInTheDocument();
    });

    it('holds the table back until the record has arrived', () => {
        listSuspensions.mockReturnValueOnce({ data: undefined, error: null, isFetching: true, refetch: vi.fn() });
        renderTab();

        expect(screen.queryByText('A7K2P9')).not.toBeInTheDocument();
    });
});
