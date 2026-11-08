import type { Period, Query, RangeLabel } from '../api';

/** Every window the picker can ask for. The server answers with the subset its tiers can serve. */
export const ALL_RANGES = ['15m', '1h', '6h', '24h', '7d', '30d', '90d'] as const;

const WORDS: Record<RangeLabel, string> = {
    '15m': '15 min',
    '1h': '1 hour',
    '6h': '6 hours',
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
};

export const rangeWords = (label: string): string => WORDS[label as RangeLabel] ?? label;

/**
 * What the tier actually being read means in plain words, so a 30 day window says "1 hour per
 * point" and the administrator knows the spikes inside it were averaged away.
 */
export function describePeriod(period: Period): string {
    const bucket = period.bucket < 60 ? `${period.bucket} s` : period.bucket < 3600 ? `${Math.round(period.bucket / 60)} min` : `${Math.round(period.bucket / 3600)} h`;
    const from = new Date(period.from).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const to = new Date(period.to).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `${from} – ${to} · ${period.tier} resolution, ${bucket} per point`;
}

/** The query string a request would go out with; also the cache key, so the two never disagree. */
export function toQuery(label: RangeLabel, extra?: Record<string, string | number | undefined>): Query {
    return { range: label, ...extra };
}

export const queryString = (query: Query): string =>
    Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
