// Hand-written API layer: the announcements endpoints are not in the generated SDK
// yet, and regeneration is owned by another workstream. These files use the raw
// `http` client, so `.oxlintrc.json` turns off `no-restricted-properties` and
// `rules/generated-api-mutations` for them, exactly as it does for the
// hand-written `api/server/files` and `api/server/backups` query modules.
import { queryOptions, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import http, { httpValidationErrors } from '@/api/http';
import { notifyHttpError } from '@/plugins/notifications';

export type AnnouncementKind = 'info' | 'success' | 'warning' | 'critical';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'paused' | 'archived';
export type AnnouncementPolicy = 'once' | 'every_visit' | 'interval' | 'until_ack';

export interface AnnouncementAudience {
    type: 'all' | 'users';
    user_ids?: number[];
}

export interface AnnouncementAttributes {
    id: number;
    name: string;
    title: string;
    body: string;
    kind: AnnouncementKind;
    display_type: AnnouncementDisplayType;
    tag_id: number | null;
    tag: AnnouncementTag | null;
    status: AnnouncementStatus;
    policy: AnnouncementPolicy;
    require_ack: boolean;
    interval_hours: number | null;
    audience: AnnouncementAudience;
    action_label: string | null;
    action_url: string | null;
    event_start: string | null;
    event_end: string | null;
    publish_at: string | null;
    expires_at: string | null;
    published_at: string | null;
    content_version: number;
    created_by: number | null;
    created_at: string;
    updated_at: string;
}

export interface AnnouncementTag {
    id: number;
    name: string;
    color: string;
    icon: string | null;
    announcements: number;
    created_at: string;
    updated_at: string;
}

export type AnnouncementDisplayType = 'banner' | 'modal';

export interface AnnouncementItem {
    object: 'announcement';
    attributes: AnnouncementAttributes;
}

export interface AnnouncementListResponse {
    object: 'list';
    data: AnnouncementItem[];
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

export interface AnnouncementStats {
    content_version: number;
    eligible: number;
    shown: number;
    acked: number;
    dismissed: number;
}

/** The admin form's shape; converted to the snake_case request body by `toRequestBody`. */
export interface AnnouncementFormValues {
    name: string;
    title: string;
    body: string;
    kind: AnnouncementKind;
    displayType: AnnouncementDisplayType;
    tagId: string | null;
    policy: AnnouncementPolicy;
    requireAck: boolean;
    intervalHours: string;
    audienceType: 'all' | 'users';
    audienceUserIds: string;
    actionLabel: string;
    actionUrl: string;
    eventStart: string;
    eventEnd: string;
    publishAt: string;
    expiresAt: string;
}

export interface AnnouncementRequestBody {
    name: string;
    title: string;
    body: string;
    kind: AnnouncementKind;
    display_type: AnnouncementDisplayType;
    tag_id: number | null;
    policy: AnnouncementPolicy;
    require_ack: boolean;
    interval_hours: number | null;
    audience: AnnouncementAudience;
    action_label: string | null;
    action_url: string | null;
    event_start: string | null;
    event_end: string | null;
    publish_at: string | null;
    expires_at: string | null;
}

const emptyFormValues: AnnouncementFormValues = {
    name: '',
    title: '',
    body: '',
    kind: 'info',
    displayType: 'banner',
    tagId: '',
    policy: 'once',
    requireAck: false,
    intervalHours: '',
    audienceType: 'all',
    audienceUserIds: '',
    actionLabel: '',
    actionUrl: '',
    eventStart: '',
    eventEnd: '',
    publishAt: '',
    expiresAt: '',
};

export const announcementFormDefaults = (announcement?: AnnouncementAttributes): AnnouncementFormValues => {
    if (!announcement) {
        return emptyFormValues;
    }

    return {
        name: announcement.name,
        title: announcement.title,
        body: announcement.body,
        kind: announcement.kind,
        displayType: announcement.display_type,
        tagId: announcement.tag_id === null ? '' : String(announcement.tag_id),
        policy: announcement.policy,
        requireAck: announcement.require_ack,
        intervalHours: announcement.interval_hours === null ? '' : String(announcement.interval_hours),
        audienceType: announcement.audience.type === 'users' ? 'users' : 'all',
        audienceUserIds: (announcement.audience.user_ids ?? []).join(', '),
        actionLabel: announcement.action_label ?? '',
        actionUrl: announcement.action_url ?? '',
        eventStart: announcement.event_start ?? '',
        eventEnd: announcement.event_end ?? '',
        publishAt: announcement.publish_at ?? '',
        expiresAt: announcement.expires_at ?? '',
    };
};

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export const announcementToRequestBody = (values: AnnouncementFormValues): AnnouncementRequestBody => {
    const userIds =
        values.audienceType === 'users'
            ? values.audienceUserIds
                  .split(',')
                  .map((part) => Number.parseInt(part.trim(), 10))
                  .filter((id) => Number.isFinite(id))
            : [];

    return {
        name: values.name.trim(),
        title: values.title.trim(),
        body: values.body,
        kind: values.kind,
        display_type: values.displayType,
        tag_id: values.tagId ? Number.parseInt(values.tagId, 10) : null,
        policy: values.policy,
        require_ack: values.requireAck,
        interval_hours: values.policy === 'interval' ? Number.parseInt(values.intervalHours || '24', 10) : null,
        audience: values.audienceType === 'users' ? { type: 'users', user_ids: userIds } : { type: 'all' },
        action_label: blankToNull(values.actionLabel),
        action_url: blankToNull(values.actionUrl),
        event_start: blankToNull(values.eventStart),
        event_end: blankToNull(values.eventEnd),
        publish_at: blankToNull(values.publishAt),
        expires_at: blankToNull(values.expiresAt),
    };
};

export interface AdminAnnouncementListParams {
    page: number;
    perPage?: number;
    status?: string;
    sort?: string;
}

const adminBase = '/api/admin/announcements';

export const fetchAdminAnnouncements = async (
    params: AdminAnnouncementListParams
): Promise<AnnouncementListResponse> => {
    const search = new URLSearchParams();

    search.set('page', String(params.page));
    search.set('per_page', String(params.perPage ?? 50));

    if (params.status) {
        search.set('filter[status]', params.status);
    }

    if (params.sort) {
        search.set('sort', params.sort);
    }

    const { data } = await http.get<AnnouncementListResponse>(`${adminBase}?${search.toString()}`);

    return data;
};

export const fetchAdminAnnouncementTags = async (): Promise<AnnouncementTag[]> => {
    const { data } = await http.get<{ data: AnnouncementTag[] }>('/api/admin/announcement-tags');

    return data.data;
};

export const useAdminAnnouncementTags = () =>
    useQuery({
        queryKey: ['admin', 'announcement-tags'],
        queryFn: fetchAdminAnnouncementTags,
        staleTime: 5 * 60_000,
    });

export const fetchAnnouncementStats = async (id: number): Promise<AnnouncementStats> => {
    // The endpoint answers with the counters as they are: no `attributes` envelope,
    // unlike the admin list resource.
    const { data } = await http.get<AnnouncementStats>(`${adminBase}/${id}/stats`);

    return data;
};

export const adminAnnouncementsQueryKey = (params: AdminAnnouncementListParams) =>
    ['admin', 'announcements', params] as const;

export const adminAnnouncementsQueryOptions = (
    params: AdminAnnouncementListParams
): UseQueryOptions<AnnouncementListResponse, Error, AnnouncementListResponse, readonly unknown[]> =>
    queryOptions<AnnouncementListResponse, Error, AnnouncementListResponse, readonly unknown[]>({
        queryKey: adminAnnouncementsQueryKey(params),
        queryFn: () => fetchAdminAnnouncements(params),
    });

type AdminAnnouncementsQueryOptions = Pick<ReturnType<typeof adminAnnouncementsQueryOptions>, 'placeholderData'> & {
    enabled?: boolean;
};

export const useAdminAnnouncements = (params: AdminAnnouncementListParams, options?: AdminAnnouncementsQueryOptions) =>
    useQuery({ ...adminAnnouncementsQueryOptions(params), ...options });

export const announcementStatsQueryOptions = (
    id: number,
    enabled = true
): UseQueryOptions<AnnouncementStats, Error, AnnouncementStats, (string | number)[]> =>
    queryOptions({
        queryKey: ['admin', 'announcements', id, 'stats'],
        queryFn: () => fetchAnnouncementStats(id),
        enabled,
    });

export const useAnnouncementStats = (id: number, enabled = true) =>
    useQuery(announcementStatsQueryOptions(id, enabled));

const invalidateAnnouncementQueries = (queryClient: ReturnType<typeof useQueryClient>, id?: number) => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    if (id !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ['client', 'announcements'] });
    }
};

/** Runs a mutation, surfacing Laravel validation errors as field-keyed toasts. */
const runAnnouncementRequest = async <T>(
    request: () => Promise<T>,
    failureTitle: string,
    onSuccess?: (result: T) => void
): Promise<T> => {
    try {
        const result = await request();

        onSuccess?.(result);

        return result;
    } catch (cause) {
        const errors = httpValidationErrors(cause);
        const first = Object.values(errors)[0];

        notifyHttpError(cause, first ? `${failureTitle}: ${first}` : failureTitle);
        throw cause;
    }
};

export const useCreateAnnouncement = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: AnnouncementRequestBody) =>
            runAnnouncementRequest(
                async () => (await http.post(`${adminBase}`, body)).data,
                'Could not create the announcement',
                () => {
                    toast.success('Draft saved. Publish it when you are ready.');
                    invalidateAnnouncementQueries(queryClient);
                }
            ),
    });
};

export const useUpdateAnnouncement = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: AnnouncementRequestBody }) =>
            runAnnouncementRequest(
                async () => (await http.put(`${adminBase}/${id}`, body)).data,
                'Could not save the announcement',
                () => {
                    toast.success('Announcement saved.');
                    invalidateAnnouncementQueries(queryClient, id);
                }
            ),
    });
};

export const deleteAnnouncementInput = (id: number) => id;

export const useDeleteAnnouncement = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) =>
            runAnnouncementRequest(
                () => http.delete(`${adminBase}/${id}`),
                'Could not delete the announcement (pause or archive it first)',
                () => {
                    toast.success('Announcement deleted.');
                    invalidateAnnouncementQueries(queryClient, id);
                }
            ),
    });
};

type TransitionAction = 'publish' | 'schedule' | 'pause' | 'archive';

const transitionMessages = {
    publish: { title: 'Could not publish the announcement', verb: 'Published — users will see it now.' },
    schedule: { title: 'Could not schedule the announcement', verb: 'Scheduled for its publish time.' },
    pause: { title: 'Could not pause the announcement', verb: 'Paused — hidden until republished.' },
    archive: { title: 'Could not archive the announcement', verb: 'Archived (read-only).' },
} satisfies Record<TransitionAction, { title: string; verb: string }>;

export const useAnnouncementTransition = (action: TransitionAction) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, body }: { id: number; body?: { publish_at: string } }) =>
            runAnnouncementRequest(
                async () =>
                    action === 'schedule'
                        ? (await http.post(`${adminBase}/${id}/schedule`, body)).data
                        : (await http.post(`${adminBase}/${id}/${action}`)).data,
                transitionMessages[action].title,
                () => {
                    toast.success(transitionMessages[action].verb);
                    invalidateAnnouncementQueries(queryClient, id);
                }
            ),
    });
};
