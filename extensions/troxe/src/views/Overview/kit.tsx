import type { ReactNode } from 'react';

/**
 * The one colour rule the meters share with the console: 80% is a warning, 90% is a fault,
 * and a healthy bar is the brand blue. Shared by the dashboard tiles and the server cards.
 */
export function meterColor({ alarm }: { readonly alarm: string | null }): string {
    if (alarm === 'danger') return 'var(--destructive)';
    if (alarm === 'warning') return 'var(--warning)';

    return 'var(--primary)';
}

/** A blocked-off left rail: the icon slot every card identity puts its mark in. */
export function CardAvatar({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            aria-hidden
            className={`troxe-inner flex size-11 shrink-0 items-center justify-center border border-hairline bg-veil text-ink-secondary ${className ?? ''}`}
        >
            {children}
        </span>
    );
}
