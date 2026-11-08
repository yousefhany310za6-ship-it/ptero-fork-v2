import type { PageFooterProps } from '@pterodactyl/sdk';

/** Replaces classic's footer primitive, which links out to the upstream project. */
export default function PageFooter({ className }: PageFooterProps) {
    return (
        <div className={className}>
            <p className='text-center fs-tiny text-ink-muted'>
                &copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span> Troxe Hosting
            </p>
        </div>
    );
}
