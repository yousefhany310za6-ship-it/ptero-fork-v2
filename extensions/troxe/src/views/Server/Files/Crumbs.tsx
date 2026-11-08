import { Fragment } from 'react';
import { CopyOnClick, NamedIcon, PanelLink } from '@pterodactyl/sdk';
import { cn, type FileBreadcrumb } from '@pterodactyl/sdk/theme';

/** The path below `/home/container`, doubled slashes collapsed. */
export const containerPath = (path: string) => `/home/container${path}`.replace(/\/{2,}/g, '/');

const crumb = 'max-w-[12rem] shrink-0 truncate rounded-md px-1.5 py-1 transition-colors';

interface Props {
    crumbs: readonly FileBreadcrumb[];
    /** The open file, shown after the crumbs. */
    file?: string | null;
    /** Where the root icon leads when the first crumb has no destination, as a new file's has not. */
    root?: FileBreadcrumb['destination'];
    /** Called instead of navigating for the crumb that is already being listed, or for the open file. */
    onBack?: () => void;
    /** The absolute container path the copy button offers. */
    copy: string;
    copyLabel?: string;
    className?: string;
}

export default function Crumbs({ crumbs, file, root, onBack, copy, copyLabel = 'this folder', className }: Props) {
    const first = crumbs[0];
    const last = crumbs.length - 1;

    return (
        <div className={cn('flex min-w-0 items-center gap-1 fs-small', className)}>
            {first.destination || root ? (
                <PanelLink
                    destination={first.destination ?? root!}
                    aria-label='Server root'
                    className={`${crumb} text-ink-secondary hover:bg-veil hover:text-foreground`}
                >
                    <NamedIcon name='hard-drive' className='size-4' aria-hidden />
                </PanelLink>
            ) : (
                <span className={`${crumb} text-ink-secondary`} aria-label='Server root'>
                    <NamedIcon name='hard-drive' className='size-4' aria-hidden />
                </span>
            )}
            {crumbs.map(({ name, path, destination }, index) => (
                <Fragment key={path}>
                    <NamedIcon name='chevron-right' className='size-3.5 shrink-0 text-ink-muted' aria-hidden />
                    {destination ? (
                        <PanelLink destination={destination} className={`${crumb} text-ink-secondary hover:bg-veil hover:text-foreground`}>
                            {name}
                        </PanelLink>
                    ) : index === last && onBack ? (
                        <button
                            type='button'
                            onClick={onBack}
                            className={`${crumb} font-semibold text-foreground hover:bg-veil`}
                        >
                            {name}
                        </button>
                    ) : (
                        <span className={`${crumb} font-semibold text-foreground`}>{name}</span>
                    )}
                </Fragment>
            ))}
            {file && (
                <>
                    <NamedIcon name='chevron-right' className='size-3.5 shrink-0 text-ink-muted' aria-hidden />
                    <span className={`${crumb} font-semibold text-foreground`}>{file}</span>
                </>
            )}
            <CopyOnClick text={copy}>
                <span className='troxe-icon-btn ml-1 !size-6 shrink-0'>
                    <NamedIcon name='copy' className='size-3.5' aria-hidden />
                    <span className='sr-only'>Copy the path of {copyLabel}</span>
                </span>
            </CopyOnClick>
        </div>
    );
}
