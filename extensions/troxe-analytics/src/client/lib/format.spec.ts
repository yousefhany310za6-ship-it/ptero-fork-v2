import { expect, test } from 'vitest';
import { formatBytes, formatCount, formatDuration, formatMiB, formatMiBPair, formatPercent, formatRate, formatShare, plural } from './format';

test('formats sizes the way the console does', () => {
    expect(formatMiB(512)).toBe('512 MiB');
    expect(formatMiB(2048)).toBe('2.0 GiB');
    expect(formatMiB(5388288)).toBe('5.1 TiB');
    expect(formatMiBPair(358400, 786432)).toBe('350 / 768 GiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatRate(1536)).toBe('1.5 KiB/s');
    expect(formatDuration(90061)).toBe('1 d 1 h');
});

/**
 * The rule the whole dashboard rests on: a figure that was never measured is drawn as unknown,
 * and only something that was measured at nothing is drawn as zero.
 */
test('keeps an unmeasured figure unmeasured', () => {
    expect(formatPercent(null)).toBe('unknown');
    expect(formatPercent(undefined)).toBe('unknown');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(33.333, 2)).toBe('33.33%');
    expect(formatShare(null, 1024)).toBe('unknown');
    expect(formatShare(1024, 0)).toBe('unknown');
    expect(formatShare(2048, 5120)).toBe('40%');
    expect(formatShare(102, 5120)).toBe('2.0%');
});

test('counts and names things for a sentence', () => {
    expect(formatCount(1234)).toBe((1234).toLocaleString(undefined));
    expect(plural(1, 'bucket')).toBe('1 bucket');
    expect(plural(2, 'bucket')).toBe('2 buckets');
});
