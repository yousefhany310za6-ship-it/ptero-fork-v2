import {
    keepPreviousData,
    queryOptions,
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import http, { httpValidationErrors } from '@/api/http';
import { notifyHttpError } from '@/plugins/notifications';

export interface AnnouncementTag {
    id: number;
    name: string;
    color: string;
    icon: string | null;
    announcements: number;
    created_at: string;
    updated_at: string;
}

export interface AnnouncementTagFormValues {
    name: string;
    color: string;
    icon: string | null;
}

const base = '/api/admin/announcement-tags';

export const announcementTagListQueryKey = ['admin', 'announcement-tags'];

const fetchAdminAnnouncementTags = async (): Promise<AnnouncementTag[]> => {
    const { data } = await http.get<{ data: AnnouncementTag[] }>(base);

    return data;
};

export const useAdminAnnouncementTags = () =>
    useQuery({
        queryKey: announcementTagListQueryKey,
        queryFn: fetchAdminAnnouncementTags,
        staleTime: 5 * 60_000,
    });

export const useCreateAnnouncementTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (body: AnnouncementTagFormValues) => {
            const { data } = await http.post<{ data: AnnouncementTag }>(base, body);
            return data.data;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: announcementTagListQueryKey });
            toast.success('Tag created.');
        },
        onError: (error: unknown) => {
            notifyHttpError(error);
        },
    });
};

export const useUpdateAnnouncementTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, body }: { id: number; body: Partial<AnnouncementTagFormValues> }) => {
            const { data } = await http.put<{ data: AnnouncementTag }>(`${base}/${id}`, body);
            return data.data;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: announcementTagListQueryKey });
            toast.success('Tag updated.');
        },
        onError: (error: unknown) => {
            notifyHttpError(error);
        },
    });
};

export const useDeleteAnnouncementTag = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number) => {
            await http.delete(`${base}/${id}`);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: announcementTagListQueryKey });
            toast.success('Tag deleted.');
        },
        onError: (error: unknown) => {
            notifyHttpError(error);
        },
    });
}
