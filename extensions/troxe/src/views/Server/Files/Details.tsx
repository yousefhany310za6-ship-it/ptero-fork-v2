import { lazy, Suspense } from 'react';
import { cn } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

const Glyph = lazy(() => import('../../../material/Glyph'));

/** The name cell of a row: what the file is, drawn with the icon theme's own colours. */
export default function Details({ model, className }: ViewProps<'server.files.details'>) {
    return (
        <div className={cn('flex min-w-0 items-center gap-3', className)}>
            <span aria-hidden className='flex size-8 shrink-0 items-center justify-center'>
                <Suspense fallback={null}>
                    <Glyph name={model.name} kind={model.kind} className='size-[19px]' />
                </Suspense>
            </span>
            <span className='truncate fs-small text-foreground'>{model.name}</span>
            {model.kind === 'symlink' && (
                <span className='troxe-chip shrink-0 !py-0 fs-micro'>link</span>
            )}
        </div>
    );
}
