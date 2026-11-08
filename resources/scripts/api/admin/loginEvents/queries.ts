// Hand-written API layer: the sign-in history endpoints are newer than the generated SDK, and
// regeneration is owned by another workstream. These files use the raw `http` client, so
// `.oxlintrc.json` turns off `no-restricted-properties` and `rules/generated-api-mutations`
// for them, exactly as it does for the announcements and ip-bans modules.
import { queryOptions, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import http from '@/api/http';
import type { UiTone } from '@/themes/skins';

/** The outcomes the recorder writes; mirrors `Pterodactyl\Enum\LoginEventOutcome`. */
export type LoginEventOutcome = 'success' | 'failed' | 'banned' | 'suspended' | 'throttled' | 'checkpoint';

export interface LoginEventAttributes {
    id: number;
    user_id: number | null;
    user_uuid: string | null;
    username_attempted: string | null;
    /** The normalised address rendered as text; null when the request carried no source address. */
    ip: string | null;
    outcome: LoginEventOutcome;
    reason: string | null;
    ip_ban_id: number | null;
    suspension_case_id: string | null;
    user_agent: string | null;
    fingerprint: string | null;
    created_at: string;
}

export interface LoginEventItem {
    object: 'login_event';
    attributes: LoginEventAttributes;
}

export interface LoginEventListResponse {
    object: 'list';
    data: LoginEventItem[];
    meta: {
        pagination: {
            total: number;
            count: number;
            per_page: number;
            current_page: number;
            total_pages: number;
        };
    };
}

export interface AdminLoginEventListParams {
    page: number;
    perPage?: number;
    /** A single address; the server matches the normalised bytes, not the text. */
    ip?: string;
    outcome?: LoginEventOutcome;
    sort?: string;
}

/** One account as the address lookup groups it: what was tried, and whether it worked. */
export interface AddressAccountRow {
    user_uuid: string | null;
    username_attempted: string | null;
    attempts: number;
    successes: number;
    last_seen: string | null;
}

export interface AddressAccountsResponse {
    data: {
        ip: string;
        accounts: AddressAccountRow[];
        truncated: boolean;
    };
}

const adminBase = '/api/admin/login-events';

/** How an outcome reads in the history table. */
export interface OutcomeMeta {
    label: string;
    tone: UiTone;
    /** What the row says happened, in the administrator's terms. */
    detail: string;
}

const outcomeMetaByOutcome = {
    success: { label: 'Signed in', tone: 'success', detail: 'Credentials accepted and a session started.' },
    failed: { label: 'Failed', tone: 'warning', detail: 'The credentials were refused.' },
    banned: { label: 'Banned', tone: 'danger', detail: 'Refused at the door, before any account was reached.' },
    suspended: { label: 'Suspended', tone: 'danger', detail: 'The account is suspended, so the session was refused.' },
    throttled: {
        label: 'Rate limited',
        tone: 'neutral',
        detail: 'Too many attempts from this address, so it was waited out.',
    },
    checkpoint: {
        label: 'Checkpoint',
        tone: 'info',
        detail: 'The password was right and a second factor was asked for.',
    },
} satisfies Record<LoginEventOutcome, OutcomeMeta>;

export const outcomeMeta = (outcome: LoginEventOutcome): OutcomeMeta => outcomeMetaByOutcome[outcome];

const outcomeOrder: readonly LoginEventOutcome[] = [
    'success',
    'failed',
    'banned',
    'suspended',
    'throttled',
    'checkpoint',
];

/**
 * The outcome a URL or a select is naming, if any. An unrecognised value is dropped rather than
 * sent, so a hand-edited address bar cannot turn into a validation error on a page the
 * administrator meant to read.
 */
export const parseOutcome = (value: string | undefined): LoginEventOutcome | undefined =>
    value === undefined ? undefined : outcomeOrder.find((outcome) => outcome === value);

const listSearch = (params: AdminLoginEventListParams): URLSearchParams => {
    const search = new URLSearchParams();

    search.set('page', String(params.page));
    search.set('per_page', String(params.perPage ?? 50));

    if (params.ip) {
        search.set('filter[ip]', params.ip);
    }

    if (params.outcome) {
        search.set('filter[outcome]', params.outcome);
    }

    if (params.sort) {
        search.set('sort', params.sort);
    }

    return search;
};

export const fetchAdminLoginEvents = async (params: AdminLoginEventListParams): Promise<LoginEventListResponse> => {
    const { data } = await http.get<LoginEventListResponse>(`${adminBase}?${listSearch(params).toString()}`);

    return data;
};

export const fetchAdminUserIpHistory = async (
    userId: number,
    params: AdminLoginEventListParams
): Promise<LoginEventListResponse> => {
    const { data } = await http.get<LoginEventListResponse>(
        `/api/admin/users/${userId}/ip-history?${listSearch(params).toString()}`
    );

    return data;
};

export const fetchAddressAccounts = async (ip: string): Promise<AddressAccountsResponse['data']> => {
    const search = new URLSearchParams({ ip });
    const { data } = await http.get<AddressAccountsResponse>(`${adminBase}/associated-accounts?${search.toString()}`);

    return data.data;
};

export const adminLoginEventsQueryKey = (params: AdminLoginEventListParams) =>
    ['admin', 'login-events', params] as const;

export const adminUserIpHistoryQueryKey = (userId: number, params: AdminLoginEventListParams) =>
    ['admin', 'users', userId, 'ip-history', params] as const;

export const addressAccountsQueryKey = (ip: string) => ['admin', 'login-events', 'associated', ip] as const;

export const adminUserIpHistoryQueryOptions = (
    userId: number,
    params: AdminLoginEventListParams
): UseQueryOptions<LoginEventListResponse, Error, LoginEventListResponse, readonly unknown[]> =>
    queryOptions<LoginEventListResponse, Error, LoginEventListResponse, readonly unknown[]>({
        queryKey: adminUserIpHistoryQueryKey(userId, params),
        queryFn: () => fetchAdminUserIpHistory(userId, params),
    });

export const addressAccountsQueryOptions = (
    ip: string
): UseQueryOptions<AddressAccountsResponse['data'], Error, AddressAccountsResponse['data'], readonly unknown[]> =>
    queryOptions<AddressAccountsResponse['data'], Error, AddressAccountsResponse['data'], readonly unknown[]>({
        queryKey: addressAccountsQueryKey(ip),
        queryFn: () => fetchAddressAccounts(ip),
        enabled: ip.trim() !== '',
        staleTime: 30_000,
    });

type AdminLoginEventQueryOptions = Pick<ReturnType<typeof adminUserIpHistoryQueryOptions>, 'placeholderData'> & {
    enabled?: boolean;
};

export const useAdminUserIpHistory = (
    userId: number,
    params: AdminLoginEventListParams,
    options?: AdminLoginEventQueryOptions
) => useQuery({ ...adminUserIpHistoryQueryOptions(userId, params), ...options });

export const useAddressAccounts = (ip: string) => useQuery(addressAccountsQueryOptions(ip));
