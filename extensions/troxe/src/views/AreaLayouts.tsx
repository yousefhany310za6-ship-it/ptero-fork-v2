import type { ReactNode } from 'react';
import { cn } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

/**
 * The area layouts only place their pages in the shell: `layout.app` lists each area's navigation in
 * its rail, so there is no second navigation above the content.
 */
function Area({ className, children }: { className?: string; children?: ReactNode }) {
    return <div className={cn('flex min-w-0 flex-1 flex-col', className)}>{children}</div>;
}

export function ServerLayout({ className, children }: ViewProps<'layout.server'>) {
    return <Area className={className}>{children}</Area>;
}

export function AccountLayout({ className, children }: ViewProps<'layout.account'>) {
    return <Area className={className}>{children}</Area>;
}

export function AdminLayout({ className, children }: ViewProps<'layout.admin'>) {
    return <Area className={className}>{children}</Area>;
}
