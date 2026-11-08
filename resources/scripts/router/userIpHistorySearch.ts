import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { parseOutcome, type LoginEventOutcome } from '@/api/admin/loginEvents/queries';
import { parsePageSearch, searchText, type PageSearch, type RawSearch } from '@/router/pageSearch';

export type IpHistorySearch = PageSearch & {
    ip?: string;
    outcome?: LoginEventOutcome;
    sort?: string;
};

const allowedSorts = ['-created_at', 'created_at'] as const;

export const parseIpHistorySearch = (search: RawSearch): IpHistorySearch => {
    const result: IpHistorySearch = { ...parsePageSearch(search) };
    const ip = searchText(search.ip);
    const outcome = parseOutcome(searchText(search.outcome));
    const sort = allowedSorts.find((value) => value === search.sort);

    if (ip) {
        result.ip = ip;
    }

    if (outcome) {
        result.outcome = outcome;
    }

    if (sort) {
        result.sort = sort;
    }

    return result;
};

export const useIpHistorySearch = () => {
    const navigate = useNavigate();
    const parsed = parseIpHistorySearch(useSearch({ strict: false }));
    const page = parsed.page ?? 1;
    const ip = parsed.ip ?? '';
    const outcome = parsed.outcome;
    const sort = parsed.sort;

    const navigateToSearch = useCallback(
        (next: { page?: number; ip?: string | null; outcome?: string | null; sort?: string | null }) => {
            const search: IpHistorySearch = {};

            if ((next.page ?? page) > 1) {
                search.page = next.page ?? page;
            }

            const nextIp = next.ip === undefined ? ip : (next.ip ?? '').trim();

            if (nextIp) {
                search.ip = nextIp;
            }

            // The select hands back whatever string its option carries; only the outcomes the
            // server can filter by survive, exactly as when the value arrives from a URL.
            const nextOutcome = parseOutcome(next.outcome === undefined ? outcome : next.outcome || undefined);

            if (nextOutcome) {
                search.outcome = nextOutcome;
            }

            const nextSort = next.sort === undefined ? sort : next.sort;

            if (nextSort) {
                search.sort = nextSort;
            }

            void navigate({ to: '.', search, replace: true, viewTransition: false });
        },
        [ip, navigate, outcome, page, sort]
    );

    return { page, ip, outcome, sort, navigateToSearch };
};
