import { Button, CopyOnClick, formatDate, PanelLink } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';
import AuthCard, { authLinkClass } from './AuthCard';

/** What the closure says about its own length, in the one sentence that is true of it. */
function durationText(permanent: boolean, expiresAt: string | null): string {
    if (permanent) {
        return 'This suspension is permanent. It stays in place until an administrator lifts it.';
    }

    if (expiresAt === null) {
        return 'This suspension is temporary, with no end date written on it.';
    }

    return `This suspension runs until ${formatDate(expiresAt, 'MMM Do, YYYY [at] h:mmA')}.`;
}

export default function SuspendedAccountPage({ model, className }: ViewProps<'page.auth.suspended'>) {
    const { caseId, message, support } = model;
    const contacts = [support.email, support.discordUrl];

    return (
        <AuthCard title='Account Suspended' className={className}>
            <p className='text-sm text-muted-foreground'>
                This account is suspended. It cannot sign in, use its API credentials, or reach its servers while it is
                closed. Nothing has been deleted: the account, its servers, their files and their backups are all still
                here for whenever access is restored.
            </p>
            {message && <p className='mt-6 rounded-sm bg-muted p-4 text-sm text-foreground'>{message}</p>}
            <p className='mt-6 text-sm text-muted-foreground'>{durationText(model.permanent, model.expiresAt)}</p>
            <div className='mt-6'>
                <p className='text-xs font-medium text-muted-foreground tracking-wide uppercase'>Support Case</p>
                <div className='mt-2 flex flex-wrap items-center gap-3'>
                    <code className='font-mono text-lg bg-muted text-foreground rounded-sm py-1 px-3 tracking-[0.2em]'>
                        {caseId}
                    </code>
                    <CopyOnClick text={caseId} showInNotification>
                        <Button type='button' size='small'>
                            Copy
                        </Button>
                    </CopyOnClick>
                </div>
                <p className='mt-2 text-xs text-muted-foreground'>
                    Quote this reference whenever you contact support. It is how the panel finds this suspension, and it
                    is the only thing you need in order to ask about it.
                </p>
            </div>
            <div className='mt-6'>
                <p className='text-xs font-medium text-muted-foreground tracking-wide uppercase'>Contact Support</p>
                {contacts.some((contact) => contact !== null) ? (
                    <ul className='mt-2 space-y-1 text-sm'>
                        {support.email && (
                            <li>
                                <a
                                    href={`mailto:${support.email}`}
                                    className='text-primary no-underline hover:underline'
                                >
                                    {support.email}
                                </a>
                            </li>
                        )}
                        {support.discordUrl && (
                            <li>
                                <a
                                    href={support.discordUrl}
                                    target='_blank'
                                    rel='noopener nofollow noreferrer'
                                    className='text-primary no-underline hover:underline'
                                >
                                    Discord
                                </a>
                            </li>
                        )}
                    </ul>
                ) : (
                    <p className='mt-2 text-sm text-muted-foreground'>
                        This panel has not published a support contact.
                    </p>
                )}
            </div>
            <div className='mt-6 text-center'>
                <PanelLink destination={model.login} className={authLinkClass}>
                    Return to Login
                </PanelLink>
            </div>
        </AuthCard>
    );
}
