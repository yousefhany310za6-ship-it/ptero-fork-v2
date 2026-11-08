import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type IpBanStatus } from '@/api/admin/ipBans/queries';
import { parsePageSearch, searchText, type PageSearch, type RawSearch } from '@/router/pageSearch';

export type IpBanListSearch = PageSearch & {
    ip?: string;
    status?: IpBanStatus;
    sort?: string;
};

const allowedStatuses: readonly IpBanStatus[] = ['active', 'expired', 'permanent'];
const allowedSorts = ['-created_at', 'created_at', '-expires_at', 'expires_at'] as const;

export const parseIpBanListSearch = (search: RawSearch): IpBanListSearch => {
    const result: IpBanListSearch = { ...parsePageSearch(search) };
    const raw = search as RawSearch & { ip?: RawSearch['page']; status?: unknown; sort?: unknown };
    const ip = searchText(raw.ip);
    const status = allowedStatuses.find((value) => value === raw.status);
    const sort = allowedSorts.find((value) => value === raw.sort);

    if (ip) {
        result.ip = ip;
    }

    if (status) {
        result.status = status;
    }

    if (sort) {
        result.sort = sort;
    }

    return result;
};

export const useIpBanListSearch = () => {
    const navigate = useNavigate();
    const parsed = parseIpBanListSearch(useSearch({ strict: false }));
    const page = parsed.page ?? 1;
    const ip = parsed.ip ?? '';
    const status = parsed.status;
    const sort = parsed.sort;

    const navigateToSearch = useCallback(
        (next: { page?: number; ip?: string | null; status?: string | null; sort?: string | null }) => {
            const search: IpBanListSearch = {};

            if ((next.page ?? page) > 1) {
                search.page = next.page ?? page;
            }

            const nextIp = next.ip === undefined ? ip : (next.ip ?? '').trim();

            if (nextIp) {
                search.ip = nextIp;
            }

            // The select hands back whatever string its option carries; only the states the
            // server can filter by survive, exactly as when the value arrives from a URL.
            const nextStatus = allowedStatuses.find(
                (value) => value === (next.status === undefined ? status : next.status)
            );

            if (nextStatus) {
                search.status = nextStatus;
            }

            const nextSort = next.sort === undefined ? sort : next.sort;

            if (nextSort) {
                search.sort = nextSort;
            }

            void navigate({ to: '.', search, replace: true, viewTransition: false });
        },
        [ip, navigate, page, sort, status]
    );

    return { page, ip, status, sort, navigateToSearch };
};
