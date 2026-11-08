import type { ExtensionConfig } from '@pterodactyl/sdk';

let config: ExtensionConfig = {};

export function setConfig(value: ExtensionConfig): void {
    config = value;
}

const url = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export const favicon = (): string | null => url(config.favicon);
export const logo = (): string | null => url(config.logo);
export const logoCollapsed = (): string | null => url(config.logo_collapsed);
export const logoMode = (): 'off' | 'beside' | 'replace' => (config.logo_mode === 'replace' ? 'replace' : config.logo_mode === 'off' ? 'off' : 'beside');
export const logoMascot = (): boolean => config.logo_mascot !== false;
export const logoHeight = (): number => (typeof config.logo_height === 'number' ? Math.min(64, Math.max(16, config.logo_height)) : 48);

/** Point every icon link in the head at the uploaded favicon. */
export function applyFavicon(): void {
    const href = favicon();
    if (!href) return;

    const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]');
    if (links.length === 0) {
        const link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
        link.href = href;
        return;
    }
    links.forEach((link) => {
        if (link.getAttribute('href') === href) return;
        link.href = href;
        link.removeAttribute('type');
        link.removeAttribute('sizes');
    });
}
