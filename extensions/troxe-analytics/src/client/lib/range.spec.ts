import { expect, test } from 'vitest';
import type { Period } from '../api';
import { describePeriod, queryString, rangeWords, toQuery } from './range';

const period = (over: Partial<Period>): Period => ({
    label: '24h',
    from: '2026-11-05T00:00:00+00:00',
    to: '2026-11-06T00:00:00+00:00',
    tier: 'hour',
    bucket: 3600,
    seconds: 86400,
    windows: ['15m', '1h', '6h', '24h', '7d'],
    ...over,
});

test('names a window the way the picker shows it', () => {
    expect(rangeWords('24h')).toBe('24 hours');
    expect(rangeWords('7d')).toBe('7 days');
    expect(rangeWords('custom')).toBe('custom');
});

/** The resolution has to be stated, because it is what a spike looks like once it is averaged. */
test('says what resolution the server actually drew', () => {
    expect(describePeriod(period({}))).toContain('hour resolution, 1 h per point');
    expect(describePeriod(period({ tier: 'raw', bucket: 600 }))).toContain('raw resolution, 10 min per point');
    expect(describePeriod(period({ tier: 'day', bucket: 86400 }))).toContain('day resolution, 24 h per point');
});

test('leaves a parameter out rather than sending an empty one', () => {
    expect(toQuery('24h', { node: 3, search: undefined })).toEqual({ range: '24h', node: 3 });
    expect(queryString({ range: '7d', node: 2, search: '' })).toBe('range=7d&node=2');
    expect(queryString({})).toBe('');
});
