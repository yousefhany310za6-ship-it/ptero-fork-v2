import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { AdminNodeListSort } from '@/api/admin/nodes/queries';
import type { AdminServerListSort } from '@/api/admin/servers/queries';
import type { AccountStatus, UserListSort } from '@/api/admin/users/queries';
import type { LocationListSort } from '@/api/admin/locations/queries';
import type { AdminDatabaseHostListSort } from '@/api/admin/database-hosts/queries';
import type { AdminMountListSort } from '@/api/admin/mounts/queries';
import type { ApiKeyListSort } from '@/api/admin/api-keys/queries';
import type { AdminTagListSort } from '@/api/admin/tags/queries';
import { parsePageSearch, searchText, type PageSearch, type RawSearch } from '@/router/pageSearch';

export {
    getPageSearch,
    parseActivitySearch,
    parseDashboardSearch,
    parseEmailSearch,
    parsePageSearch,
    useActivitySearch,
    useDashboardSearch,
    usePageSearch,
    type ActivitySearch,
    type DashboardSearch,
    type PageSearch,
    type RawSearch,
} from '@/router/pageSearch';

export type AdminListSearch = PageSearch & {
    filter?: string;
};

export type ServerListSearch = AdminListSearch & {
    sort?: AdminServerListSort;
};

export type NodeListSearch = AdminListSearch & {
    sort?: AdminNodeListSort;
};

export type UserListSearch = AdminListSearch & { sort?: UserListSort; status?: AccountStatus };
export type LocationListSearch = AdminListSearch & { sort?: LocationListSort };
export type DatabaseHostListSearch = AdminListSearch & { sort?: AdminDatabaseHostListSort };
export type MountListSearch = AdminListSearch & { sort?: AdminMountListSort };
export type ApiKeyListSearch = AdminListSearch & { sort?: ApiKeyListSort };
export type TagListSearch = AdminListSearch & { sort?: AdminTagListSort };

type AdminListSort =
    | AdminServerListSort
    | AdminNodeListSort
    | UserListSort
    | LocationListSort
    | AdminDatabaseHostListSort
    | AdminMountListSort
    | AdminTagListSort
    | ApiKeyListSort;

export const parseAdminListSearch = (search: RawSearch): AdminListSearch => {
    const result: AdminListSearch = { ...parsePageSearch(search) };
    const filter = searchText(search.filter);

    if (filter) {
        result.filter = filter;
    }

    return result;
};

const parseAllowedSort = <TSort extends string>(value: RawSearch['sort'], allowed: readonly TSort[]) =>
    allowed.find((sort) => sort === value);

const parseSortableAdminListSearch = <TSort extends string>(
    search: RawSearch,
    allowed: readonly TSort[]
): AdminListSearch & { sort?: TSort } => {
    const result: AdminListSearch & { sort?: TSort } = { ...parseAdminListSearch(search) };
    const sort = parseAllowedSort(search.sort, allowed);

    if (sort) {
        result.sort = sort;
    }

    return result;
};

export const parseServerListSearch = (search: RawSearch): ServerListSearch =>
    parseSortableAdminListSearch<AdminServerListSort>(search, ['name', '-name', 'created_at', '-created_at']);

export const parseNodeListSearch = (search: RawSearch): NodeListSearch =>
    parseSortableAdminListSearch<AdminNodeListSort>(search, [
        'name',
        '-name',
        'memory',
        '-memory',
        'disk',
        '-disk',
        'created_at',
        '-created_at',
    ]);

const accountStatuses: readonly AccountStatus[] = ['active', 'suspended'];

export const parseUserListSearch = (search: RawSearch): UserListSearch => {
    const result: UserListSearch = parseSortableAdminListSearch(search, [
        'email',
        '-email',
        'username',
        '-username',
        'created_at',
        '-created_at',
    ]);
    const status = accountStatuses.find((value) => value === search.status);

    if (status) {
        result.status = status;
    }

    return result;
};

export const parseLocationListSearch = (search: RawSearch): LocationListSearch =>
    parseSortableAdminListSearch(search, ['short', '-short', 'created_at', '-created_at']);

export const parseDatabaseHostListSearch = (search: RawSearch): DatabaseHostListSearch =>
    parseSortableAdminListSearch(search, ['name', '-name', 'created_at', '-created_at']);

export const parseMountListSearch = (search: RawSearch): MountListSearch =>
    parseSortableAdminListSearch(search, ['name', '-name']);

export const parseApiKeyListSearch = (search: RawSearch): ApiKeyListSearch =>
    parseSortableAdminListSearch(search, ['memo', '-memo', 'created_at', '-created_at']);

export const parseTagListSearch = (search: RawSearch): TagListSearch =>
    parseSortableAdminListSearch(search, ['name', '-name', 'slug', '-slug']);

interface SortableAdminListSearchUpdate<TSort extends string> {
    page?: number;
    filter?: string;
    sort?: TSort | null;
}

const useSortableAdminListSearch = <TSort extends AdminListSort>(
    parse: (search: RawSearch) => AdminListSearch & { sort?: TSort }
) => {
    const navigate = useNavigate();
    const { page = 1, filter = '', sort } = parse(useSearch({ strict: false }));

    const navigateToSearch = useCallback(
        (next: SortableAdminListSearchUpdate<TSort>) => {
            const nextFilter = next.filter === undefined ? filter : next.filter.trim();
            const nextPage = next.page ?? page;
            const nextSort = next.sort === undefined ? sort : (next.sort ?? undefined);
            const search: AdminListSearch & { sort?: TSort } = {};

            if (nextPage > 1) {
                search.page = nextPage;
            }

            if (nextFilter.length > 0) {
                search.filter = nextFilter;
            }

            if (nextSort) {
                search.sort = nextSort;
            }

            void navigate({
                to: '.',
                search,
                replace: true,
                viewTransition: false,
            });
        },
        [filter, navigate, page, sort]
    );

    return { page, filter, sort, navigateToSearch };
};

export const useServerListSearch = () => useSortableAdminListSearch(parseServerListSearch);
export const useNodeListSearch = () => useSortableAdminListSearch(parseNodeListSearch);
export const useUserListSearch = () => {
    const navigate = useNavigate();
    const { page = 1, filter = '', sort, status } = parseUserListSearch(useSearch({ strict: false }));

    const navigateToSearch = useCallback(
        (next: SortableAdminListSearchUpdate<UserListSort> & { status?: string | null }) => {
            const search: UserListSearch = {};
            const nextPage = next.page ?? page;
            const nextFilter = next.filter === undefined ? filter : (next.filter ?? '').trim();
            const nextSort = next.sort === undefined ? sort : next.sort;
            // The select hands back whatever string its option carries; only the two states the
            // server filters by survive, exactly as when the value arrives from a URL.
            const nextStatus = accountStatuses.find(
                (value) => value === (next.status === undefined ? status : next.status)
            );

            if (nextPage > 1) {
                search.page = nextPage;
            }

            if (nextFilter.length > 0) {
                search.filter = nextFilter;
            }

            if (nextSort) {
                search.sort = nextSort;
            }

            if (nextStatus) {
                search.status = nextStatus;
            }

            void navigate({ to: '.', search, replace: true, viewTransition: false });
        },
        [filter, navigate, page, sort, status]
    );

    return { page, filter, sort, status, navigateToSearch };
};

export const useLocationListSearch = () => useSortableAdminListSearch(parseLocationListSearch);
export const useDatabaseHostListSearch = () => useSortableAdminListSearch(parseDatabaseHostListSearch);
export const useMountListSearch = () => useSortableAdminListSearch(parseMountListSearch);
export const useTagListSearch = () => useSortableAdminListSearch(parseTagListSearch);
export const useApiKeyListSearch = () => useSortableAdminListSearch(parseApiKeyListSearch);
