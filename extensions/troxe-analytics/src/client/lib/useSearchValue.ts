import { usePanelLocation } from '@pterodactyl/sdk';

/**
 * One value from the current URL's query string.
 *
 * Analytics screens have no routes of their own beyond the ones the manifest declares, so a link
 * from one page to another passes what to open as a search value rather than inventing a path.
 */
export function useSearchValue(name: string): string | undefined {
    const { search } = usePanelLocation();
    const value = (search as Record<string, unknown> | undefined)?.[name];

    return value === undefined || value === null ? undefined : String(value);
}
