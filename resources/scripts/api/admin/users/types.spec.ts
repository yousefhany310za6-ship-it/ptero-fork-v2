import { describe, expect, it } from 'vitest';
import type { AdminUserAttributes } from '@/api/generated';
import { accountFieldsOf, type AccountStatus } from '@/api/admin/users/types';

/** The four fields the panel answers with ahead of the next SDK refresh, as the payload spells them. */
interface AccountFields {
    readonly account_status?: AccountStatus;
    readonly support_case_id?: string | null;
    readonly last_login_at?: string | null;
    readonly last_ip?: string | null;
}

const attributes = (fields: AccountFields): AdminUserAttributes =>
    ({ email: 'alex@example.test', ...fields }) as AdminUserAttributes;

describe('accountFieldsOf', () => {
    /** The generated resource type does not describe these fields yet, so a plain row must still read. */
    it('reads an untouched row as an open account with nothing to quote', () => {
        expect(accountFieldsOf(attributes({}))).toEqual({
            status: 'active',
            supportCaseId: null,
            lastLoginAt: null,
            lastIp: null,
        });
    });

    it('carries a suspension reference and the last address the panel answered for', () => {
        const fields = accountFieldsOf(
            attributes({
                account_status: 'suspended',
                support_case_id: 'A7K2P9',
                last_login_at: '2026-11-04T09:12:00Z',
                last_ip: '203.0.113.7',
            })
        );

        expect(fields).toEqual({
            status: 'suspended',
            supportCaseId: 'A7K2P9',
            lastLoginAt: '2026-11-04T09:12:00Z',
            lastIp: '203.0.113.7',
        });
    });

    /**
     * Non-root readers are answered `null` for the address rather than omitting it, and a lifted
     * suspension leaves no reference behind; neither is a value a screen should have to guess about.
     */
    it('keeps an absent address and an absent reference null', () => {
        const fields = accountFieldsOf(
            attributes({ account_status: 'suspended', support_case_id: null, last_login_at: null, last_ip: null })
        );

        expect(fields.status).toBe('suspended');
        expect(fields.supportCaseId).toBeNull();
        expect(fields.lastLoginAt).toBeNull();
        expect(fields.lastIp).toBeNull();
    });

    it('treats anything but a suspension as an open account', () => {
        expect(accountFieldsOf(attributes({ account_status: 'active' })).status).toBe('active');
        expect(accountFieldsOf(attributes({})).status).toBe('active');
    });
});
