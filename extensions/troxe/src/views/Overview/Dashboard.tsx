import {
    Alert,
    CopyOnClick,
    NamedIcon,
    PageContentBlock,
    PanelLink,
    Spinner,
    cn,
    formatDate,
    useCurrentUser,
    useSiteSettings,
} from '@pterodactyl/sdk';
import { View, type ViewProps } from '@pterodactyl/sdk/theme';
import { useTroxeLogo } from '../../lib/logo';

/** Until the clock says otherwise, the greeting is the only thing on this page that changes by itself. */
function greeting(date = new Date()): string {
    const hour = date.getHours();
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';

    return 'Good evening';
}

/** The signed-in user, the panel's name and the time of day: everything the banner can honestly say. */
function Welcome() {
    const user = useCurrentUser();
    const site = useSiteSettings();
    const logo = useTroxeLogo();
    const now = new Date();

    return (
        <section className='troxe-card troxe-glow-brand relative overflow-hidden p-5 sm:p-6'>
            <div className='troxe-glow pointer-events-none absolute inset-0' aria-hidden />
            {logo && (
                <img
                    src={logo}
                    alt=''
                    aria-hidden
                    className='pointer-events-none absolute -right-6 -bottom-10 h-40 w-auto opacity-[0.05] sm:h-48'
                />
            )}
            <div className='relative flex flex-wrap items-center gap-x-5 gap-y-4'>
                <span
                    aria-hidden
                    className='troxe-badge-icon troxe-inner flex size-14 shrink-0 items-center justify-center text-[1.4rem] font-extrabold uppercase'
                >
                    {(user.firstName?.[0] || user.username[0]).toUpperCase()}
                </span>
                <div className='min-w-0 flex-1 basis-52'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='fs-micro font-semibold uppercase tracking-[0.14em] text-ink-muted'>
                            {formatDate(now, 'dddd, MMMM D')}
                        </p>
                        <span className='troxe-chip'>
                            <NamedIcon name='server' className='size-3 shrink-0' aria-hidden />
                            {site.name}
                        </span>
                        {user.rootAdmin && (
                            <span className='troxe-chip text-primary'>
                                <NamedIcon name='crown' className='size-3 shrink-0' aria-hidden />
                                Root admin
                            </span>
                        )}
                    </div>
                    <h1 className='mt-1.5 break-words text-[1.7rem] leading-tight font-extrabold tracking-tight sm:text-[2rem]'>
                        {greeting()}, {user.firstName?.split(' ')[0] || user.username}
                    </h1>
                    <p className='mt-1 fs-small text-ink-secondary'>
                        Member since {formatDate(user.createdAt, 'MMM D, YYYY')} · here is where your services stand.
                    </p>
                </div>
            </div>
        </section>
    );
}

interface Action {
    readonly icon: string;
    readonly label: string;
    readonly hint: string;
    readonly to: '/account' | '/account/api' | '/account/ssh' | '/account/activity' | '/panel';
    /** The route only exists for root admins. */
    readonly admin?: boolean;
}

/** Every link here is a route the panel really has; none is a placeholder waiting for a feature. */
const actions: readonly Action[] = [
    { icon: 'user-round', label: 'Account', hint: 'Name, email and password', to: '/account' },
    { icon: 'history', label: 'Activity', hint: 'Every action on this account', to: '/account/activity' },
    { icon: 'key-round', label: 'API keys', hint: 'Credentials for the client API', to: '/account/api' },
    { icon: 'terminal', label: 'SSH keys', hint: 'Keys for the panel and SFTP', to: '/account/ssh' },
    { icon: 'settings', label: 'Admin', hint: 'Servers, nodes and settings', to: '/panel', admin: true },
];

function QuickActions({ rootAdmin }: { rootAdmin: boolean }) {
    const visible = actions.filter((action) => !action.admin || rootAdmin);

    return (
        <section className='troxe-card p-4 sm:p-5'>
            <h2 className='mb-3 fs-lead font-bold tracking-tight'>Quick actions</h2>
            <div className='flex flex-col'>
                {visible.map((action, index) => (
                    <PanelLink
                        key={action.to}
                        destination={{ to: action.to }}
                        className={cn(
                            'group flex min-w-0 items-center gap-3 py-2.5 text-left transition-colors hover:text-foreground',
                            index > 0 && 'border-t border-hairline',
                        )}
                    >
                        <span
                            aria-hidden
                            className='troxe-inner flex size-8 shrink-0 items-center justify-center border border-hairline bg-veil text-ink-secondary transition-colors group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary'
                        >
                            <NamedIcon name={action.icon} className='size-4' />
                        </span>
                        <span className='min-w-0 flex-1 leading-tight'>
                            <span className='block truncate fs-small font-semibold'>{action.label}</span>
                            <span className='block truncate fs-tiny text-ink-muted'>{action.hint}</span>
                        </span>
                        <NamedIcon
                            name='arrow-right'
                            className='size-3.5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5'
                        />
                    </PanelLink>
                ))}
            </div>
        </section>
    );
}

/** The account's own record, read from the session the panel already holds. */
function AccountInformation() {
    const user = useCurrentUser();
    const rows = [
        { label: 'Username', value: user.username },
        { label: 'Email', value: user.email },
        { label: 'Language', value: user.language },
        { label: 'Two-factor', value: user.useTotp ? 'Enabled' : 'Not enabled', tone: user.useTotp ? 'text-success' : 'text-warning' },
        { label: 'Last updated', value: formatDate(user.updatedAt, 'MMM D, YYYY') },
    ];

    return (
        <section className='troxe-card p-4 sm:p-5'>
            <div className='mb-3 flex items-center justify-between gap-3'>
                <h2 className='fs-lead font-bold tracking-tight'>Account</h2>
                <CopyOnClick text={user.uuid} showInNotification={false}>
                    <span className='troxe-chip cursor-pointer font-mono hover:text-foreground' title={user.uuid}>
                        {`${user.uuid.slice(0, 8)}…`}
                    </span>
                </CopyOnClick>
            </div>
            <dl className='flex flex-col divide-y divide-hairline'>
                {rows.map((row) => (
                    <div key={row.label} className='flex items-baseline justify-between gap-3 py-2'>
                        <dt className='shrink-0 fs-tiny text-ink-muted'>{row.label}</dt>
                        <dd className={cn('min-w-0 truncate text-right fs-small', row.tone)}>{row.value}</dd>
                    </div>
                ))}
            </dl>
            {!user.useTotp && (
                <Alert type='warning' className='mt-3'>
                    <span className='min-w-0'>
                        Two-factor authentication is off.{' '}
                        <PanelLink destination={{ to: '/account' }} className='font-semibold underline'>
                            Turn it on
                        </PanelLink>{' '}
                        to protect this account.
                    </span>
                </Alert>
            )}
        </section>
    );
}

export default function Overview({ model, className }: ViewProps<'page.dashboard'>) {
    const user = useCurrentUser();

    if (model.loading) {
        return <Spinner centered size='large' />;
    }

    return (
        <PageContentBlock title='Overview' className={className}>
            <div className='flex flex-col gap-4 sm:gap-5'>
                {model.error && (
                    <Alert type='danger' title='Some of this page did not load'>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <span className='min-w-0'>{model.error}</span>
                            <button type='button' onClick={model.retry} className='troxe-chip hover:text-foreground'>
                                Try again
                            </button>
                        </div>
                    </Alert>
                )}
                <View name='dashboard.announcements' />
                <Welcome />
                <View name='dashboard.serverList' />
                <div className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
                    <section className='troxe-card flex min-w-0 flex-col p-4 sm:p-5'>
                        <div className='mb-3 flex items-center justify-between gap-3'>
                            <h2 className='fs-lead font-bold tracking-tight'>Recent activity</h2>
                            <PanelLink
                                destination={{ to: '/account/activity' }}
                                className='inline-flex items-center gap-1 fs-tiny font-semibold text-ink-secondary hover:text-foreground'
                            >
                                View all
                                <NamedIcon name='arrow-right' className='size-3' />
                            </PanelLink>
                        </div>
                        <div className='troxe-log max-h-96 min-w-0 overflow-y-auto pr-1'>
                            <View name='activity.log' scope='account' />
                        </div>
                    </section>
                    <div className='flex min-w-0 flex-col gap-4'>
                        <QuickActions rootAdmin={user.rootAdmin} />
                        <AccountInformation />
                    </div>
                </div>
            </div>
        </PageContentBlock>
    );
}
