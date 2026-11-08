import { NamedIcon } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

/** The address the player types into Minecraft: a quiet mono chip, not a headline. */
export default function ServerCardAddress({ model, className }: ViewProps<'dashboard.serverCard.address'>) {
    return (
        <div
            className={`hidden lg:flex col-span-2 flex-row items-center justify-center min-w-0 ${className ?? ''}`}
        >
            {model.address ? (
                <span className='troxe-chip max-w-full gap-1.5 font-mono fs-tiny'>
                    <NamedIcon name='ethernet-port' className='size-3.5 shrink-0 text-ink-muted' aria-hidden />
                    <span className='min-w-0 truncate'>{model.address}</span>
                </span>
            ) : (
                <span className='troxe-chip fs-tiny text-ink-muted'>
                    <NamedIcon name='ethernet-port' className='size-3.5 shrink-0' aria-hidden />
                    no address yet
                </span>
            )}
        </div>
    );
}
