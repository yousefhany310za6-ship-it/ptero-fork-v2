import { useSyncExternalStore } from 'react';
import { onThemeChange, readThemeToken } from '@pterodactyl/sdk';

const URL_TOKEN = /^url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"'()\\]*))\s*\)$/s;

let cached: string | null | undefined;

const read = () => {
    const match = URL_TOKEN.exec(readThemeToken('--brand-logo').trim());
    const raw = match?.[1] ?? match?.[2] ?? match?.[3];

    return raw ? decodeURI(raw) : null;
};

/** The `--brand-logo` image of the active scheme, resolved for the document rather than the stylesheet. */
export function useTroxeLogo(): string | null {
    return useSyncExternalStore(
        (listener) =>
            onThemeChange(() => {
                cached = undefined;
                listener();
            }),
        () => (cached ??= read()),
        () => null
    );
}
