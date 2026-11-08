import { expect, test } from 'vitest';
import { formatAgo, formatBytes, formatMiB, formatMiBPair } from './format';

test('formats sizes and ages', () => {
    expect(formatMiB(512)).toBe('512 MiB');
    expect(formatMiB(2048)).toBe('2.0 GiB');
    expect(formatMiB(5388288)).toBe('5.1 TiB');
    expect(formatMiB(-760)).toBe('-760 MiB');
    expect(formatMiBPair(358400, 786432)).toBe('350 / 768 GiB');
    expect(formatMiBPair(700784, 5388288)).toBe('684 GiB / 5.1 TiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatAgo(new Date(Date.now() - 5 * 60000).toISOString())).toBe('5 min ago');
    expect(formatAgo(null)).toBe('never');
});
