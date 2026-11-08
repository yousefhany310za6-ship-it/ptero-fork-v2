import { LayoutGrid, Server, UserRound } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useCurrentUser } from '@/api/account/queries';
import PageContentBlock from '@/components/elements/PageContentBlock';

export default function UserOverviewPage() {
    const user = useCurrentUser();
    const navigate = useNavigate();

    const cards = [
        {
            title: 'My Servers',
            description: 'View and manage the servers available to your account.',
            icon: Server,
            to: '/my-server' as const,
        },
        {
            title: 'Profile',
            description: 'Update your account details, password, and security settings.',
            icon: UserRound,
            to: '/profile' as const,
        },
    ];

    return (
        <PageContentBlock title='Overview' showFlashKey='overview'>
            <div className='mb-8'>
                <div className='mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                    <LayoutGrid className='h-3.5 w-3.5' aria-hidden />
                    Overview
                </div>
                <h1 className='text-2xl font-semibold tracking-tight text-foreground'>
                    Welcome back{user?.username ? `, ${user.username}` : ''}
                </h1>
                <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
                    Quick access to your servers, billing area, and account profile.
                </p>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
                {cards.map(({ title, description, icon: Icon, to }) => (
                    <button
                        key={title}
                        type='button'
                        onClick={() => void navigate({ to })}
                        className='group rounded-2xl border border-border bg-card/70 p-5 text-left shadow-sm transition hover:border-foreground/20 hover:bg-card'
                    >
                        <div className='mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground'>
                            <Icon className='h-5 w-5' aria-hidden />
                        </div>
                        <div className='text-base font-semibold text-foreground'>{title}</div>
                        <p className='mt-1 text-sm leading-6 text-muted-foreground'>{description}</p>
                        <div className='mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition group-hover:text-foreground'>
                            Open
                        </div>
                    </button>
                ))}
            </div>
        </PageContentBlock>
    );
}
