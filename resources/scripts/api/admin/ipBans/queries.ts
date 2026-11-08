// Hand-written API layer: the ip-bans endpoints are newer than the generated SDK, and
// regeneration is owned by another workstream. These files use the raw `http` client, so
// `.oxlintrc.json` turns off `no-restricted-properties` and `rules/generated-api-mutations`
// for them, exactly as it does for the announcements and files modules.
import { queryOptions, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import http, { httpValidationErrors } from '@/api/http';
import { notifyHttpError } from '@/plugins/notifications';

export type IpBanDuration = 'permanent' | 'temporary';
export type IpBanStatus = 'active' | 'expired' | 'permanent';

export interface IpBanAttributes {
    id: number;
    ip: string;
    is_range: boolean;
    reason: string;
    is_permanent: boolean;
    expires_at: string | null;
    created_by: number | null;
    created_at: string;
    updated_at: string;
}

export interface IpBanItem {
    object: 'ip_ban';
    attributes: IpBanAttributes;
}

export interface IpBanListResponse {
    object: 'list';
    data: IpBanItem[];
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

export interface AdminIpBanListParams {
    page: number;
    perPage?: number;
    /** A single address; the server returns the ban whose range covers it. */
    ip?: string;
    status?: IpBanStatus;
    reason?: string;
    sort?: string;
}

/** The admin dialog's shape; `toRequestBody` converts it to the snake_case request body. */
export interface IpBanFormValues {
    ip: string;
    reason: string;
    duration: IpBanDuration;
    expiresAt: string;
    acknowledgeBroad: boolean;
}

export interface IpBanRequestBody {
    ip: string;
    reason: string;
    duration: IpBanDuration;
    expires_at: string | null;
    acknowledge_broad: boolean;
}

const adminBase = '/api/admin/ip-bans';

export const ipBanFormDefaults: IpBanFormValues = {
    ip: '',
    reason: '',
    duration: 'permanent',
    expiresAt: '',
    acknowledgeBroad: false,
};

/** What a typed address or CIDR covers, as the dialog reads it. */
export interface IpBanRangeStats {
    hosts: bigint | null;
    isBroad: boolean;
}

/**
 * What a typed address or CIDR covers, in the same normalised 128-bit space the panel stores
 * bans in: an IPv4 prefix is offset by 96, and the range is wide enough to need confirmation
 * below a /112 — the server's `IpBanService::MIN_UNCONFIRMED_PREFIX`. Mirrored for immediate
 * feedback only; the server stays the authority.
 */
export const rangeStats = (value: string): IpBanRangeStats => {
    const text = value.trim();

    if (!text) {
        return { hosts: null, isBroad: false };
    }

    const [address, prefixText] = text.split('/');
    const isV6 = address.includes(':');
    const hostBits = isV6 ? 128 : 32;
    const prefix = prefixText === undefined ? hostBits : Number.parseInt(prefixText, 10);

    if (!Number.isSafeInteger(prefix) || prefix < 0 || prefix > hostBits) {
        return { hosts: null, isBroad: false };
    }

    const normalized = isV6 ? prefix : prefix + 96;

    return { hosts: 2n ** BigInt(128 - normalized), isBroad: normalized < 112 };
};

export const ipBanToRequestBody = (values: IpBanFormValues): IpBanRequestBody => ({
    ip: values.ip.trim(),
    reason: values.reason.trim(),
    duration: values.duration,
    expires_at: values.duration === 'temporary' && values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
    acknowledge_broad: values.acknowledgeBroad,
});

export const fetchAdminIpBans = async (params: AdminIpBanListParams): Promise<IpBanListResponse> => {
    const search = new URLSearchParams();

    search.set('page', String(params.page));
    search.set('per_page', String(params.perPage ?? 50));

    if (params.ip) {
        search.set('filter[ip]', params.ip);
    }

    if (params.status) {
        search.set('filter[status]', params.status);
    }

    if (params.reason) {
        search.set('filter[reason]', params.reason);
    }

    if (params.sort) {
        search.set('sort', params.sort);
    }

    const { data } = await http.get<IpBanListResponse>(`${adminBase}?${search.toString()}`);

    return data;
};

export const adminIpBansQueryKey = (params: AdminIpBanListParams) => ['admin', 'ip-bans', params] as const;

export const adminIpBansQueryOptions = (
    params: AdminIpBanListParams
): UseQueryOptions<IpBanListResponse, Error, IpBanListResponse, readonly unknown[]> =>
    queryOptions<IpBanListResponse, Error, IpBanListResponse, readonly unknown[]>({
        queryKey: adminIpBansQueryKey(params),
        queryFn: () => fetchAdminIpBans(params),
    });

type AdminIpBansQueryOptions = Pick<ReturnType<typeof adminIpBansQueryOptions>, 'placeholderData'> & {
    enabled?: boolean;
};

export const useAdminIpBans = (params: AdminIpBanListParams, options?: AdminIpBansQueryOptions) =>
    useQuery({ ...adminIpBansQueryOptions(params), ...options });

/** Runs a mutation, surfacing Laravel validation errors as field-keyed toasts. */
const runIpBanRequest = async <T>(
    request: () => Promise<T>,
    failureTitle: string,
    onSuccess?: () => void
): Promise<T> => {
    try {
        const result = await request();

        onSuccess?.();

        return result;
    } catch (cause) {
        const errors = httpValidationErrors(cause);
        const first = Object.values(errors)[0];

        notifyHttpError(cause, first ? `${failureTitle}: ${first}` : failureTitle);
        throw cause;
    }
};

export const useCreateIpBan = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: IpBanRequestBody) =>
            runIpBanRequest(
                async () => (await http.post(adminBase, body)).data,
                'Could not ban the address',
                () => {
                    toast.success('Sign-in from that range is refused from now on.');
                    void queryClient.invalidateQueries({ queryKey: ['admin', 'ip-bans'] });
                }
            ),
    });
};

export const useDeleteIpBan = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) =>
            runIpBanRequest(
                () => http.delete(`${adminBase}/${id}`),
                'Could not lift the ban',
                () => {
                    toast.success('Ban lifted — the address may sign in again.');
                    void queryClient.invalidateQueries({ queryKey: ['admin', 'ip-bans'] });
                }
            ),
    });
};
