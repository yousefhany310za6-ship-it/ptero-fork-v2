// Hand-written API layer: the announcements endpoints are not in the generated SDK
// yet, and regeneration is owned by another workstream. These files use the raw
// `http` client, so `.oxlintrc.json` turns off `no-restricted-properties` and
// `rules/generated-api-mutations` for them, exactly as it does for the
// hand-written `api/server/files` and `api/server/backups` query modules.
import {
    keepPreviousData,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import http from '@/api/http';
import type { AnnouncementDisplayType, AnnouncementKind, AnnouncementPolicy, AnnouncementTag } from '@/api/admin/announcements/queries';

export interface PublicAnnouncementInteraction {
    acked_at: string | null;
    dismissed_at: string | null;
}

/**
 * What a normal user is allowed to know: never the internal name, audience,
 * creator, or status — the server serialises exactly this shape. The fields are
 * flat inside `data[]`, with the caller's own interaction appended, which is not
 * the `{object, attributes}` envelope the admin resource uses.
 */
export interface PublicAnnouncement {
    id: number;
    kind: AnnouncementKind;
    display_type: AnnouncementDisplayType;
    tag: AnnouncementTag | null;
    title: string;
    body: string;
    policy: AnnouncementPolicy;
    require_ack: boolean;
    interval_hours: number | null;
    action_label: string | null;
    action_url: string | null;
    event_start: string | null;
    event_end: string | null;
    publish_at: string | null;
    expires_at: string | null;
    content_version: number;
    interaction: PublicAnnouncementInteraction | null;
}

const base = '/api/client/announcements';

export const clientAnnouncementsQueryKey = ['client', 'announcements'];

const fetchClientAnnouncements = async (): Promise<PublicAnnouncement[]> => {
    const { data } = await http.get<{ data: PublicAnnouncement[] }>(base);

    return data.data;
};

export const clientAnnouncementsQueryOptions = (): UseQueryOptions<
    PublicAnnouncement[],
    Error,
    PublicAnnouncement[],
    string[]
> =>
    queryOptions({
        queryKey: clientAnnouncementsQueryKey,
        queryFn: fetchClientAnnouncements,
        // A freshly published or re-versioned banner should appear without a
        // manual reload, but the endpoint is cheap and never paginated.
        staleTime: 15_000,
        refetchOnWindowFocus: true,
    });

export const useClientAnnouncements = () =>
    useQuery({
        ...clientAnnouncementsQueryOptions(),
        placeholderData: keepPreviousData,
        // A banner a admin publishes shows up on an open dashboard within one interval;
        // only while the tab is visible, so idle clients stay quiet.
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,
    });

const postInteraction = async (id: number, action: 'shown' | 'ack' | 'dismiss'): Promise<void> => {
    await http.post(`${base}/${id}/${action}`);
};

/** Impression beacon — feeds stats and the interval policy, never a read receipt. */
export const useReportAnnouncementShown = () =>
    useMutation({ mutationFn: (id: number) => postInteraction(id, 'shown') });

export const useAckAnnouncement = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => postInteraction(id, 'ack'),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientAnnouncementsQueryKey }),
    });
};

export const useDismissAnnouncement = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => postInteraction(id, 'dismiss'),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientAnnouncementsQueryKey }),
    });
};
