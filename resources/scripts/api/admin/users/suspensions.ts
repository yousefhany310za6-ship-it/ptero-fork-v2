// Hand-written API layer: the suspension endpoints are newer than the generated SDK, and
// regeneration is owned by another workstream. This file uses the raw `http` client, so
// `.oxlintrc.json` turns off `no-restricted-properties` and `rules/generated-api-mutations`
// for it, exactly as it does for the announcements, ip-bans and login-events modules.
import { queryOptions, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import http, { httpValidationErrors } from '@/api/http';
import { invalidateGeneratedOperations } from '@/api/mutationUtils';
import { notifyHttpError } from '@/plugins/notifications';
import type { UiTone } from '@/themes/skins';

/** Mirrors `Pterodactyl\Enum\SuspensionReason`. */
export type SuspensionReason =
    | 'terms_of_service_violation'
    | 'abuse_of_service'
    | 'suspicious_activity'
    | 'payment_issues'
    | 'security_violation'
    | 'other';

/** Mirrors `Pterodactyl\Enum\ServerSuspensionOutcome`. */
export type ServerSuspensionOutcome =
    | 'suspended'
    | 'released'
    | 'already_suspended'
    | 'deferred'
    | 'cancelled'
    | 'failed';

/** The three states `filter[status]` selects, and the state every row carries. */
export type SuspensionStatus = 'active' | 'expired' | 'lifted';

export type SuspensionDuration = 'permanent' | 'temporary';

export interface SuspensionServer {
    server_id: number;
    server_uuid: string;
    outcome: ServerSuspensionOutcome;
    wings_state_before: string | null;
    failure: string | null;
}

export interface UserSuspensionAttributes {
    id: number;
    user_id: number;
    support_case_id: string;
    reason: SuspensionReason;
    status: SuspensionStatus;
    /** The newest version of what the account holder is told; older versions are not listed. */
    message: string | null;
    internal_note: string | null;
    is_permanent: boolean;
    expires_at: string | null;
    created_by: number | null;
    lifted_by: number | null;
    lifted_at: string | null;
    created_at: string;
    updated_at: string;
    servers: SuspensionServer[];
}

export interface UserSuspensionItem {
    object: 'user_suspension';
    attributes: UserSuspensionAttributes;
}

export interface UserSuspensionListResponse {
    object: 'list';
    data: UserSuspensionItem[];
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

export interface SuspensionListParams {
    page: number;
    perPage?: number;
    status?: SuspensionStatus;
    sort?: string;
}

export interface SuspensionSearchParams {
    page: number;
    perPage?: number;
    /** The six-character reference an account holder quotes; the server rejects a value that cannot be one. */
    supportCaseId?: string;
    userId?: number;
    status?: SuspensionStatus;
    sort?: string;
}

/** The admin dialog's shape; `suspendToRequestBody` converts it to the snake_case request body. */
export interface SuspendFormValues {
    reason: SuspensionReason;
    message: string;
    internalNote: string;
    duration: SuspensionDuration;
    expiresAt: string;
    acknowledgeLockout: boolean;
}

export interface SuspendRequestBody {
    reason: SuspensionReason;
    message: string;
    internal_note: string | null;
    expires_at: string | null;
    acknowledge_lockout: boolean;
}

export const suspendFormDefaults: SuspendFormValues = {
    reason: 'suspicious_activity',
    message: '',
    internalNote: '',
    duration: 'permanent',
    expiresAt: '',
    acknowledgeLockout: false,
};

/**
 * What a permanent suspension and a dated one look like in one body: the end date is the
 * difference, so the server never has to keep a duration column in step with a timestamp.
 */
export const suspendToRequestBody = (values: SuspendFormValues): SuspendRequestBody => ({
    reason: values.reason,
    message: values.message.trim(),
    internal_note: values.internalNote.trim() === '' ? null : values.internalNote.trim(),
    expires_at: values.duration === 'temporary' && values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
    acknowledge_lockout: values.acknowledgeLockout,
});

/** Why an account can be closed, in the order the dialog lists them. */
export const suspensionReasons: readonly { value: SuspensionReason; label: string }[] = [
    { value: 'terms_of_service_violation', label: 'Terms of Service violation' },
    { value: 'abuse_of_service', label: 'Abuse of service' },
    { value: 'suspicious_activity', label: 'Suspicious activity' },
    { value: 'payment_issues', label: 'Payment issues' },
    { value: 'security_violation', label: 'Security violation' },
    { value: 'other', label: 'Other' },
];

export interface SuspensionToneMeta {
    label: string;
    tone: UiTone;
}

/** How a stored reason reads; an unrecognised value is shown as it arrived rather than hidden. */
export const suspensionReasonLabel = (reason: SuspensionReason): string =>
    suspensionReasons.find((option) => option.value === reason)?.label ?? reason;

const statusMetaByStatus = {
    active: { label: 'Suspended', tone: 'danger' },
    expired: { label: 'Expired', tone: 'warning' },
    lifted: { label: 'Lifted', tone: 'neutral' },
} satisfies Record<SuspensionStatus, SuspensionToneMeta>;

/**
 * The status the panel worked out, as a badge. "Expired" is its own state because the account is
 * still closed while its end date is being waited out by a person — the date passing is not access
 * restored.
 */
export const suspensionStatusMeta = (status: SuspensionStatus): SuspensionToneMeta => statusMetaByStatus[status];

const outcomeMetaByOutcome = {
    suspended: { label: 'Stopped', tone: 'danger' },
    released: { label: 'Released', tone: 'success' },
    already_suspended: { label: 'Already stopped', tone: 'neutral' },
    deferred: { label: 'Deferred', tone: 'warning' },
    cancelled: { label: 'Skipped', tone: 'neutral' },
    failed: { label: 'Failed', tone: 'danger' },
} satisfies Record<ServerSuspensionOutcome, SuspensionToneMeta>;

/** What the panel actually managed to do to one of the account's servers. */
export const serverSuspensionOutcomeMeta = (outcome: ServerSuspensionOutcome): SuspensionToneMeta =>
    outcomeMetaByOutcome[outcome];

const adminUsersBase = '/api/admin/users';
const adminSuspensionsBase = '/api/admin/suspensions';

const listSearch = (params: SuspensionListParams | SuspensionSearchParams): URLSearchParams => {
    const search = new URLSearchParams();

    search.set('page', String(params.page));
    search.set('per_page', String(params.perPage ?? 50));

    const status = 'status' in params ? params.status : undefined;
    const supportCaseId = 'supportCaseId' in params ? params.supportCaseId : undefined;
    const userId = 'userId' in params ? params.userId : undefined;

    if (status) {
        search.set('filter[status]', status);
    }

    if (supportCaseId) {
        search.set('filter[support_case_id]', supportCaseId);
    }

    if (userId !== undefined) {
        search.set('filter[user_id]', String(userId));
    }

    if (params.sort) {
        search.set('sort', params.sort);
    }

    return search;
};

export const fetchUserSuspensions = async (
    userId: number,
    params: SuspensionListParams
): Promise<UserSuspensionListResponse> => {
    const { data } = await http.get<UserSuspensionListResponse>(
        `${adminUsersBase}/${userId}/suspensions?${listSearch(params).toString()}`
    );

    return data;
};

export const fetchSuspensions = async (params: SuspensionSearchParams): Promise<UserSuspensionListResponse> => {
    const { data } = await http.get<UserSuspensionListResponse>(
        `${adminSuspensionsBase}?${listSearch(params).toString()}`
    );

    return data;
};

export const userSuspensionsQueryKey = (userId: number, params: SuspensionListParams) =>
    ['admin', 'users', userId, 'suspensions', params] as const;

export const suspensionsQueryKey = (params: SuspensionSearchParams) => ['admin', 'suspensions', params] as const;

export const userSuspensionsQueryOptions = (
    userId: number,
    params: SuspensionListParams
): UseQueryOptions<UserSuspensionListResponse, Error, UserSuspensionListResponse, readonly unknown[]> =>
    queryOptions<UserSuspensionListResponse, Error, UserSuspensionListResponse, readonly unknown[]>({
        queryKey: userSuspensionsQueryKey(userId, params),
        queryFn: () => fetchUserSuspensions(userId, params),
    });

export const suspensionsQueryOptions = (
    params: SuspensionSearchParams
): UseQueryOptions<UserSuspensionListResponse, Error, UserSuspensionListResponse, readonly unknown[]> =>
    queryOptions<UserSuspensionListResponse, Error, UserSuspensionListResponse, readonly unknown[]>({
        queryKey: suspensionsQueryKey(params),
        queryFn: () => fetchSuspensions(params),
        // A case id is typed by hand out of an email, and retyping it should not re-query a
        // record that only changes when somebody decides to change it.
        staleTime: 30_000,
    });

type SuspensionQueryOptions = Pick<ReturnType<typeof userSuspensionsQueryOptions>, 'placeholderData'> & {
    enabled?: boolean;
};

export const useUserSuspensions = (userId: number, params: SuspensionListParams, options?: SuspensionQueryOptions) =>
    useQuery({ ...userSuspensionsQueryOptions(userId, params), ...options });

export const useSuspensions = (params: SuspensionSearchParams, options?: SuspensionQueryOptions) =>
    useQuery({ ...suspensionsQueryOptions(params), ...options });

/**
 * Every decision about an account reaches the same three places: the list the administrator came
 * from, the account page that now shows a different status, and the history that gained a row.
 */
const refreshAccount = async (queryClient: ReturnType<typeof useQueryClient>, userId: number): Promise<void> => {
    await Promise.all([
        invalidateGeneratedOperations(queryClient, ['adminListUsers', 'adminGetUser']),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users', userId, 'suspensions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'suspensions'] }),
    ]);
};

/** Runs a mutation, surfacing Laravel validation errors as field-keyed toasts. */
const runSuspensionRequest = async <T>(
    request: () => Promise<T>,
    failureTitle: string,
    onSuccess: (result: T) => Promise<void> | void
): Promise<T> => {
    try {
        const result = await request();

        await onSuccess(result);

        return result;
    } catch (cause) {
        const errors = httpValidationErrors(cause);
        const first = Object.values(errors)[0];

        notifyHttpError(cause, first ? `${failureTitle}: ${first}` : failureTitle);
        throw cause;
    }
};

export const useSuspendUser = (userId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: SuspendRequestBody) =>
            runSuspensionRequest(
                async () =>
                    (
                        await http.post<{ attributes: UserSuspensionAttributes }>(
                            `${adminUsersBase}/${userId}/suspension`,
                            body
                        )
                    ).data,
                'Could not suspend the account',
                async ({ attributes }) => {
                    toast.success('Account suspended.', {
                        description: `Support case ${attributes.support_case_id} — every server it owns was told to stop.`,
                    });
                    await refreshAccount(queryClient, userId);
                }
            ),
    });
};

export const useUnsuspendUser = (userId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () =>
            runSuspensionRequest(
                () => http.delete(`${adminUsersBase}/${userId}/suspension`),
                'Could not lift the suspension',
                async () => {
                    toast.success('Suspension lifted.', {
                        description: 'The account may sign in again; its servers stay stopped until started.',
                    });
                    await refreshAccount(queryClient, userId);
                }
            ),
    });
};

export const useUpdateSuspensionMessage = (userId: number) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (message: string) =>
            runSuspensionRequest(
                async () =>
                    (
                        await http.post<{ attributes: UserSuspensionAttributes }>(
                            `${adminUsersBase}/${userId}/suspension/message`,
                            { message }
                        )
                    ).data,
                'Could not update the message',
                async () => {
                    toast.success('Message updated.', {
                        description: 'The account sees the new text; the original stays on the record.',
                    });
                    await refreshAccount(queryClient, userId);
                }
            ),
    });
};
