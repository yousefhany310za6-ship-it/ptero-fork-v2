import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parsePageSearch, searchText, type PageSearch, type RawSearch } from '@/router/pageSearch';

export type AnnouncementListSearch = PageSearch & {
    filter?: string;
    status?: string;
    sort?: string;
};

const allowedStatuses = ['draft', 'scheduled', 'published', 'paused', 'archived', 'active'] as const;
const allowedSorts = ['-updated_at', 'updated_at', '-publish_at', 'publish_at', '-created_at', 'created_at'] as const;

export const parseAnnouncementListSearch = (search: RawSearch): AnnouncementListSearch => {
    const result: AnnouncementListSearch = { ...parsePageSearch(search) };
    const raw = search as RawSearch & { status?: unknown; sort?: unknown };
    const filter = searchText(search.filter);
    const status = allowedStatuses.find((value) => value === raw.status);
    const sort = allowedSorts.find((value) => value === raw.sort);

    if (filter) {
        result.filter = filter;
    }

    if (status) {
        result.status = status;
    }

    if (sort) {
        result.sort = sort;
    }

    return result;
};

export const useAnnouncementListSearch = () => {
    const navigate = useNavigate();
    const { page = 1, filter = '', status = '', sort } = parseAnnouncementListSearch(useSearch({ strict: false }));

    const navigateToSearch = useCallback(
        (next: { page?: number; filter?: string; status?: string | null; sort?: string | null }) => {
            const search: AnnouncementListSearch = {};

            if ((next.page ?? page) > 1) {
                search.page = next.page ?? page;
            }

            const nextFilter = next.filter === undefined ? filter : next.filter.trim();

            if (nextFilter.length > 0) {
                search.filter = nextFilter;
            }

            const nextStatus = next.status === undefined ? status : next.status;

            if (nextStatus) {
                search.status = nextStatus;
            }

            const nextSort = next.sort === undefined ? sort : next.sort;

            if (nextSort) {
                search.sort = nextSort;
            }

            void navigate({ to: '.', search, replace: true, viewTransition: false });
        },
        [filter, navigate, page, sort, status]
    );

    return { page, filter, status, sort, navigateToSearch };
};
