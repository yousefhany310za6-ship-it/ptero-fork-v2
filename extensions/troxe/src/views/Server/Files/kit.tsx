import { useCallback, useState } from 'react';
import { NamedIcon } from '@pterodactyl/sdk';
import type { LucideIcon, LucideProps } from 'lucide-react';
import type { FileManagerEntry } from '@pterodactyl/sdk/theme';

/**
 * A lucide name where the SDK asks for a component, so the theme borrows the panel's icon set instead
 * of bundling its own.
 */
export const icon = (name: string): LucideIcon =>
    ((props: LucideProps) => <NamedIcon name={name} {...props} />) as unknown as LucideIcon;

/** Whether an action is still running; rejections are swallowed, the panel having reported them. */
export function usePending(): [boolean, (action: Promise<unknown>) => void] {
    const [count, setCount] = useState(0);
    const track = useCallback((action: Promise<unknown>) => {
        setCount((current) => current + 1);
        void action.catch(() => {}).finally(() => setCount((current) => current - 1));
    }, []);

    return [count > 0, track];
}

/** One grid for the header and every row, so the columns line up at each breakpoint. */
export const columns = [
    'grid items-center gap-x-3',
    'grid-cols-[2rem_minmax(0,1fr)_2.5rem]',
    'sm:grid-cols-[2rem_minmax(0,1fr)_6rem_2.5rem]',
    'md:grid-cols-[2rem_minmax(0,1fr)_6rem_10rem_2.5rem]',
    'xl:grid-cols-[2rem_minmax(0,1fr)_6rem_10rem_5rem_2.5rem]',
].join(' ');

/** The same columns, as a cell and as a header button: `block` and `flex` must not fight. */
export const sizeCell = 'hidden sm:block text-right fs-tiny text-ink-secondary tabular-nums';
export const timeCell = 'hidden md:block text-right fs-tiny text-ink-muted';
export const modeCell = 'hidden xl:block text-right font-mono fs-tiny text-ink-muted';
export const sizeHead = 'hidden sm:flex justify-end';
export const timeHead = 'hidden md:flex justify-end';
export const modeHead = 'hidden xl:flex justify-end';
export const actionCell = 'flex justify-end';

/** A directory sorts before a file, whatever the column. */
export const byKind = (a: FileManagerEntry, b: FileManagerEntry) =>
    Number(a.kind !== 'directory') - Number(b.kind !== 'directory');
