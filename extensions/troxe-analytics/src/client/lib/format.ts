export function formatMiB(mib: number): string {
    if (mib < 0) return `-${formatMiB(-mib)}`;
    if (mib >= 1048576) return `${(mib / 1048576).toFixed(1)} TiB`;

    return mib >= 1024 ? `${(mib / 1024).toFixed(mib >= 10240 ? 0 : 1)} GiB` : `${Math.round(mib)} MiB`;
}

/** "350 / 768 GiB", or "684 GiB / 5.1 TiB" when the units differ. */
export function formatMiBPair(part: number, whole: number): string {
    const [first, second] = [formatMiB(part), formatMiB(whole)];
    const unit = second.slice(second.lastIndexOf(' '));

    return first.endsWith(unit) ? `${first.slice(0, -unit.length)} / ${second}` : `${first} / ${second}`;
}

export function formatBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A rate as the console states it: bytes per second, in the largest unit that stays readable. */
export function formatRate(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatAgo(value: string | null, now = Date.now()): string {
    if (!value) {
        return 'never';
    }

    const minutes = Math.round((now - new Date(value).getTime()) / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;

    return `${Math.round(minutes / 1440)} d ago`;
}

export function formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);

    return days > 0 ? `${days} d ${hours} h` : `${hours} h ${Math.floor((seconds % 3600) / 60)} min`;
}

export function formatTime(seconds: number, withDate: boolean): string {
    return new Date(seconds * 1000).toLocaleString(undefined, withDate ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Counts with thousands separators, because a fleet's request total is not a small number. */
export const formatCount = (count: number): string => count.toLocaleString(undefined);

/**
 * A percentage of something, or the honest word for having no figure at all. `null` is drawn as
 * "unknown" rather than as zero, because a zero on this dashboard means something measured.
 */
export const formatPercent = (value: number | null | undefined, digits = 0): string =>
    value === null || value === undefined ? 'unknown' : `${value.toFixed(digits)}%`;

/** A share of a whole that may be zero, which is a server sold with no limit recorded. */
export const formatShare = (part: number | null, whole: number): string =>
    part === null || whole <= 0 ? 'unknown' : `${((part / whole) * 100).toFixed(part / whole > 0.1 ? 0 : 1)}%`;
