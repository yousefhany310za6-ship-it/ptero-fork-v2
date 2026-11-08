import { useMemo, useState } from 'react';
import type { RangeLabel } from '../api';
import { ALL_RANGES, queryString } from './range';

/**
 * The window a screen reads, held in the screen rather than in the URL: analytics is a reader of
 * stored history, and nothing here is worth a navigation.
 */
export function useWindowed(extra?: Record<string, string | number | undefined>, initial: RangeLabel = '24h') {
    const [label, setLabel] = useState<RangeLabel>(initial);
    const stable = useMemo(() => JSON.stringify(extra ?? {}), [extra]);

    const query = useMemo(() => ({ range: label, ...JSON.parse(stable) as Record<string, string | number> }), [label, stable]);

    return { label, setLabel, query, key: queryString(query) };
}
