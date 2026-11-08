import { files, folders, fallbacks } from './icons.generated';

/** Anything importing this module belongs in the file views' lazy chunk, keeping the glyphs off first paint. */

const withoutLeadingDot = (name: string) => (name.startsWith('.') && !name.includes('.', 1) ? name.slice(1) : name);

/**
 * The icon key for a file, the way the icon theme resolves one: the whole name first, then the longest
 * suffix after a dot, so `backup.tar.gz` reads as an archive rather than as `gz`.
 */
export function fileIcon(name: string): string {
    const lower = name.toLowerCase();

    // A dot-file such as `.env` also matches the definition written without its dot.
    const hit = files[lower] ?? files[withoutLeadingDot(lower)];
    if (hit) {
        return hit;
    }

    for (let index = lower.indexOf('.') + 1; index > 0; index = lower.indexOf('.', index) + 1) {
        const suffix = lower.slice(index);
        const byExtension = files[suffix];
        if (byExtension) {
            return byExtension;
        }
    }

    return fallbacks.file;
}

/** The icon key for a folder, by its exact name. */
export function folderIcon(name: string): string {
    return folders[name.toLowerCase()] ?? fallbacks.folder;
}

/** The icon key for a file-manager entry of any kind. */
export function iconKey(entry: { name: string; kind: string }): string {
    return entry.kind === 'directory' ? folderIcon(entry.name) : fileIcon(entry.name);
}
