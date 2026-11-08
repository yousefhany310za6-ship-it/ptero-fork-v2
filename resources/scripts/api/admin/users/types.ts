import type { AdminUserAttributes } from '@/api/generated';
import type { ExtensionFormValues } from '@/extensions/forms';

export interface UserValues {
    email: string;
    username: string;
    nameFirst: string;
    nameLast: string;
    password: string;
    rootAdmin: boolean;
    language: string;
    extensions: ExtensionFormValues;
}

/** Mirrors `Pterodactyl\Enum\AccountStatus`. */
export type AccountStatus = 'active' | 'suspended';

/** What the account endpoints carry that the published SDK does not describe yet. */
export interface AdminUserAccountFields {
    status: AccountStatus;
    /** The reference of the suspension closing the account, null while it is open. */
    supportCaseId: string | null;
    lastLoginAt: string | null;
    /** Null unless the reader is root: the address belongs to whoever signed in, not to the directory. */
    lastIp: string | null;
}

/** The account fields the panel answers with, as they are spelled in the payload. */
interface AccountFieldsCarrier {
    readonly account_status?: AccountStatus;
    readonly support_case_id?: string | null;
    readonly last_login_at?: string | null;
    readonly last_ip?: string | null;
}

/**
 * The four fields a user row is answered with ahead of the next `npm run api:refresh`, which is
 * owned by another workstream. They are read here rather than added to the generated resource type
 * because that type is the extension contract too — widening it would tell every plugin that the
 * SDK vouches for fields it does not. So the payload is decoded at the boundary instead, and what
 * comes out is total: a caller never has to decide what a missing `account_status` would mean.
 */
export const accountFieldsOf = (attributes: AdminUserAttributes & AccountFieldsCarrier): AdminUserAccountFields => ({
    // A row that does not say otherwise is an account the panel is willing to open.
    status: attributes.account_status ?? 'active',
    supportCaseId: attributes.support_case_id ?? null,
    lastLoginAt: attributes.last_login_at ?? null,
    lastIp: attributes.last_ip ?? null,
});
