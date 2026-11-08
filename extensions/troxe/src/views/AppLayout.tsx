import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { DropdownMenu, NamedIcon, PanelLink, SpinnerOverlay, cn } from '@pterodactyl/sdk';
import {
    Main,
    Navigation,
    NavigationLink,
    Slot,
    View,
    type AppArea,
    type AppLayoutModel,
    type NavItem,
    type ServerRunState,
    type ViewProps,
} from '@pterodactyl/sdk/theme';

const row = [
    'flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 fs-small no-underline',
    'transition-[background-color,color,box-shadow] duration-150',
    'text-ink-secondary hover:bg-veil hover:text-foreground',
    // The active destination is the one blue surface in the rail: filled, lit, and white on top.
    'data-[status=active]:bg-primary data-[status=active]:text-primary-foreground',
    'data-[status=active]:shadow-[0_10px_26px_-14px_var(--brand-rim)]',
    'data-[status=active]:hover:bg-primary data-[status=active]:hover:text-primary-foreground',
].join(' ');

const icon = 'h-4 w-4 shrink-0';

const overline = 'px-3 pt-2 pb-1 fs-micro font-semibold uppercase tracking-[0.14em] text-ink-muted';

/** `md` in Tailwind — the width at which the rail stops being a drawer. */
const DESKTOP = '(min-width: 48rem)';

/** An area the rail draws its own navigation for. */
type RoutedArea = Exclude<AppArea, { kind: 'dashboard' }>;

const areaTitle: Record<RoutedArea['kind'], string> = {
    account: 'Account',
    admin: 'Administration',
    server: 'Server',
};

/** The app link an area already offers, so the rail does not name the same place twice. */
const ownLink: Record<RoutedArea['kind'], 'admin' | 'account' | null> = { account: 'account', admin: 'admin', server: null };

const runState: Record<ServerRunState | 'unknown', { label: string; dot: string }> = {
    running: { label: 'Running', dot: 'bg-success' },
    starting: { label: 'Starting', dot: 'bg-warning' },
    stopping: { label: 'Stopping', dot: 'bg-warning' },
    offline: { label: 'Stopped', dot: 'bg-muted-foreground' },
    unknown: { label: 'No report', dot: 'bg-destructive' },
};

function ItemContent({ item, badge }: { item: NavItem; badge: ReactNode }) {
    return (
        <>
            {item.icon ? (
                <NamedIcon name={item.icon} className={icon} aria-hidden />
            ) : (
                <span className={icon} aria-hidden />
            )}
            <span className='min-w-0 flex-1 truncate'>{item.label}</span>
            {badge}
        </>
    );
}

/** Consecutive items of one group share a heading; `<Navigation>` still gates each item on its own. */
function groupRuns(items: readonly NavItem[]) {
    return items.reduce<{ group: string | null; items: NavItem[] }[]>((runs, item) => {
        const last = runs[runs.length - 1];

        if (last && last.group === item.group) {
            last.items.push(item);
        } else {
            runs.push({ group: item.group, items: [item] });
        }

        return runs;
    }, []);
}

function AreaRows({ items }: { items: readonly NavItem[] }) {
    return (
        <>
            {groupRuns(items).map(({ group, items: run }) => (
                <div key={`${group ?? ''}:${run[0].id}`} className='flex flex-col gap-1'>
                    {group && <p className={overline}>{group}</p>}
                    <Navigation items={run}>
                        {(item, state) => (
                            <NavigationLink item={item} className={row} aria-label={item.label}>
                                <ItemContent item={item} badge={state.badge} />
                            </NavigationLink>
                        )}
                    </Navigation>
                </div>
            ))}
        </>
    );
}

function AreaSlot({ area }: { area: RoutedArea }) {
    if (area.kind === 'server') {
        return (
            <>
                <Slot name='server.navigation.before' data={area.server} />
                <AreaRows items={area.nav.items} />
                <Slot name='server.navigation.after' data={area.server} />
            </>
        );
    }

    if (area.kind === 'account') {
        return (
            <>
                <Slot name='account.navigation.before' />
                <AreaRows items={area.nav.items} />
                <Slot name='account.navigation.after' />
            </>
        );
    }

    return (
        <>
            <Slot name='panel.navigation.before' />
            <AreaRows items={area.nav.items} />
            <Slot name='panel.navigation.after' />
        </>
    );
}

/**
 * The area the user is inside: its pages are listed here rather than in a bar above them, and one
 * row leads back out.
 */
function AreaSection({ area, onNavigate }: { area: RoutedArea; onNavigate: () => void }) {
    const state = area.kind === 'server' ? area.state : null;
    const shown = runState[state ?? 'unknown'];

    return (
        <section
            aria-label={`${areaTitle[area.kind]} navigation`}
            className='flex flex-col gap-1'
            onClick={onNavigate}
        >
            <div className='flex flex-col gap-1 border-b border-border pb-3'>
                <p className={cn(overline, 'pt-0')}>{areaTitle[area.kind]}</p>
                {area.kind === 'server' && (
                    <>
                        <p className='truncate px-3 fs-small font-semibold text-foreground'>{area.name}</p>
                        <p className='flex items-center gap-2 px-3 fs-tiny text-ink-muted'>
                            <span className={cn('size-1.5 shrink-0 rounded-full', shown.dot)} aria-hidden />
                            {shown.label}
                        </p>
                    </>
                )}
            </div>
            <PanelLink destination={{ to: '/' }} exact className={row} aria-label='Back to dashboard'>
                <NamedIcon name='arrow-left' className={icon} aria-hidden />
                <span className='min-w-0 flex-1 truncate'>Back to Dashboard</span>
            </PanelLink>
            <AreaSlot area={area} />
            {area.kind === 'server' && area.adminLink && (
                <NavigationLink
                    item={area.adminLink}
                    className={cn(row, 'border-t border-border pt-3 fs-tiny')}
                    aria-label={area.adminLink.label}
                >
                    <ItemContent item={area.adminLink} badge={null} />
                </NavigationLink>
            )}
        </section>
    );
}

function NavRows({ model, onNavigate }: { model: AppLayoutModel; onNavigate: () => void }) {
    const area = model.area;
    const hidden: string[] = area.kind === 'dashboard' ? [] : ['dashboard', ownLink[area.kind] ?? ''];
    const links = model.links.filter((link) => !hidden.includes(link.id));

    if (!links.length) {
        return null;
    }

    return (
        <nav
            aria-label='Main'
            className={cn('flex flex-col gap-1', area.kind !== 'dashboard' && 'border-t border-border pt-3')}
            onClick={onNavigate}
        >
            <Slot name='nav.items.before' />
            {links.map((link) => (
                <PanelLink
                    key={link.id}
                    destination={link.destination}
                    exact={link.exact}
                    className={row}
                    aria-label={link.label}
                >
                    <NamedIcon name={link.icon} className={icon} aria-hidden />
                    <span className='truncate'>{link.label}</span>
                </PanelLink>
            ))}
            <Slot name='nav.items.after' />
        </nav>
    );
}

function SchemeToggle({ model }: { model: AppLayoutModel }) {
    if (!model.setScheme) {
        return null;
    }

    return (
        <DropdownMenu
            triggerClassName={row}
            triggerContent={
                <>
                    <NamedIcon name='moon' className={icon} aria-hidden />
                    {/* A phone has the icon; the word appears once there is room for it. */}
                    <span className='hidden sm:inline'>Appearance</span>
                </>
            }
        >
            {model.schemes.map((scheme) => (
                <DropdownMenu.Item
                    key={scheme}
                    checked={scheme === model.preference}
                    onClick={() => model.setScheme?.(scheme)}
                >
                    {scheme === 'dark' ? 'Dark' : 'Light'}
                </DropdownMenu.Item>
            ))}
            <DropdownMenu.Item checked={model.preference === 'system'} onClick={() => model.setScheme?.('system')}>
                System
            </DropdownMenu.Item>
        </DropdownMenu>
    );
}

function Account({ model }: { model: AppLayoutModel }) {
    return (
        <div className='flex items-center gap-3 border-t border-border px-3 py-4'>
            <span className='troxe-badge-icon size-8 shrink-0 rounded-xl'>
                <NamedIcon name='user-round' className='size-4' aria-hidden />
            </span>
            <span className='min-w-0 flex-1'>
                <span className='block truncate fs-small text-foreground'>{model.user.username}</span>
                <span className='block truncate fs-tiny text-ink-muted'>{model.user.email}</span>
            </span>
            <button type='button' onClick={model.signOut} className={row} aria-label='Sign out' title='Sign out'>
                <NamedIcon name='log-out' className={icon} aria-hidden />
            </button>
        </div>
    );
}

/**
 * The brand lockup: the Troxe mark, a hairline rule, and the panel name split across two lines so
 * the wordmark reads the way it does on the site. A name with no second word is drawn on one line.
 */
function Wordmark({ model, onClose }: { model: AppLayoutModel; onClose: () => void }) {
    const [first, ...rest] = model.brand.name.trim().split(/\s+/);
    const tagline = rest.join(' ');

    return (
        <div className='flex shrink-0 items-center gap-2 px-3 py-5'>
            <PanelLink
                destination={{ to: '/' }}
                className='group flex min-w-0 flex-1 items-center gap-2.5 no-underline'
                aria-label={model.brand.name}
                onClick={onClose}
            >
                {model.brand.logoUrl && (
                    <img
                        src={model.brand.logoUrl}
                        alt={model.brand.name}
                        className='h-9 w-auto shrink-0 transition-transform duration-200 group-hover:scale-[1.04]'
                    />
                )}
                <span className='hidden h-8 w-px shrink-0 bg-hairline sm:block' aria-hidden />
                <span className='flex min-w-0 flex-col leading-none'>
                    <span className='truncate text-[0.95rem] font-extrabold uppercase tracking-[0.2em] text-foreground'>
                        {first}
                    </span>
                    {tagline && (
                        <span className='mt-1 truncate fs-micro font-semibold uppercase tracking-[0.38em] text-ink-muted'>
                            {tagline}
                        </span>
                    )}
                </span>
            </PanelLink>
            <button type='button' onClick={onClose} className='troxe-icon-btn md:hidden' aria-label='Close navigation'>
                <NamedIcon name='x' className={icon} aria-hidden />
            </button>
        </div>
    );
}

/** Whatever `<PanelLink>` accepts as a destination, so the tabs below stay on the panel's routes. */
type TabDestination = NonNullable<ComponentProps<typeof PanelLink>['destination']>;

interface Tab {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly destination: TabDestination;
    readonly exact: boolean;
}

/**
 * The four destinations a thumb reaches on a phone. Inside a server they are that server's own
 * pages; anywhere else the bar is the account's. The rail holds everything else.
 */
function tabsFor(area: AppArea, rootAdmin: boolean): Tab[] {
    if (area.kind === 'server') {
        const id = area.identifier;

        return [
            { id: 'servers', label: 'Servers', icon: 'server', destination: { to: '/my-server' }, exact: true },
            {
                id: 'console',
                label: 'Console',
                icon: 'square-terminal',
                destination: { to: '/server/$id', params: { id } },
                exact: true,
            },
            {
                id: 'settings',
                label: 'Settings',
                icon: 'settings',
                destination: { to: '/server/$id/settings', params: { id } },
                exact: true,
            },
            { id: 'profile', label: 'Profile', icon: 'user-round', destination: { to: '/profile' }, exact: false },
        ];
    }

    const adminTabs: Tab[] = rootAdmin
        ? [{ id: 'admin', label: 'Admin', icon: 'shield', destination: { to: '/panel' }, exact: false }]
        : [];

    return [
        { id: 'overview', label: 'Overview', icon: 'layout-grid', destination: { to: '/overview' }, exact: true },
        { id: 'servers', label: 'Servers', icon: 'server', destination: { to: '/my-server' }, exact: true },
        ...adminTabs,
        { id: 'profile', label: 'Profile', icon: 'user-round', destination: { to: '/profile' }, exact: false },
    ];
}

/**
 * The mobile tab bar sits over the page, so the last row of content has to clear it; `pb-24` on the
 * scroll column is that clearance, and it disappears with the bar at `md`.
 */
function TabBar({ area, rootAdmin, open }: { area: AppArea; rootAdmin: boolean; open: boolean }) {
    return (
        <nav
            aria-label='Primary'
            inert={open}
            className='troxe-tabbar troxe-glass fixed inset-x-0 bottom-0 z-30 flex border-t border-border md:hidden'
        >
            {tabsFor(area, rootAdmin).map((tab) => (
                <PanelLink
                    key={tab.id}
                    destination={tab.destination}
                    exact={tab.exact}
                    className='troxe-tab relative group'
                    aria-label={tab.label}
                >
                    <NamedIcon
                        name={tab.icon}
                        className='size-5 shrink-0 transition-transform duration-150 group-data-[status=active]:-translate-y-px'
                        aria-hidden
                    />
                    <span className='truncate'>{tab.label}</span>
                </PanelLink>
            ))}
        </nav>
    );
}

/**
 * A left rail replaces classic's icon bar: wordmark, labelled navigation, appearance and the account
 * block at its foot, with the page in a scroll column beside it. Below `md` the rail slides in over a
 * dimmed page, and closes on its own once a link is followed.
 *
 * The area layout's navigation lives in this rail rather than in a bar over the page, so the pages of
 * a server, of the account and of the admin area are all reachable from one place on every width.
 */
export default function AppLayout({ model, className, children }: ViewProps<'layout.app'>) {
    const [open, setOpen] = useState(false);
    const drawer = useRef<HTMLElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    const user = model.user;

    const close = useCallback(() => {
        setOpen(false);
        const node = drawer.current;
        // Focus returns to the button only when the drawer took it, so pointer users keep their scroll place.
        if (node && toggle.current && (node === document.activeElement || node.contains(document.activeElement))) {
            toggle.current.focus();
        }
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
        const media = window.matchMedia(DESKTOP);
        const onMedia = (event: MediaQueryListEvent) => event.matches && setOpen(false);
        const root = document.documentElement;
        const scrolled = root.style.overflow;

        document.addEventListener('keydown', onKey);
        media.addEventListener('change', onMedia);
        root.style.overflow = 'hidden';
        drawer.current?.focus();

        return () => {
            document.removeEventListener('keydown', onKey);
            media.removeEventListener('change', onMedia);
            root.style.overflow = scrolled;
        };
    }, [open, close]);

    const area = model.area;

    return (
        <div
            data-troxe-layout
            className={cn('relative flex min-h-dvh flex-col overflow-x-clip bg-background md:h-dvh md:flex-row', className)}
        >
            <SpinnerOverlay visible={model.signingOut} />
            {/* The geometric backdrop is decoration, so it is invisible to assistive technology and
                sits behind everything the page actually holds. */}
            <div role='presentation' aria-hidden className='troxe-backdrop' />
            <div
                role='presentation'
                tabIndex={open ? 0 : -1}
                onClick={close}
                className={cn(
                    'fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 md:hidden',
                    open ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
            />
            <aside
                id='troxe-nav'
                ref={drawer}
                tabIndex={-1}
                aria-label='Main navigation'
                className={cn(
                    'troxe-drawer troxe-glass fixed inset-y-0 left-0 z-50 flex w-[min(17rem,85vw)] flex-col',
                    'border-r border-border outline-none transition-[transform,visibility] duration-200 ease-out',
                    'shadow-xl md:static md:z-auto md:h-full md:w-60 md:visible md:translate-x-0 md:shrink-0 md:shadow-none md:transition-none',
                    open ? 'visible translate-x-0' : 'invisible -translate-x-full',
                )}
            >
                <Wordmark model={model} onClose={close} />
                <div className='flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-3'>
                    {area.kind !== 'dashboard' && <AreaSection area={area} onNavigate={close} />}
                    <NavRows model={model} onNavigate={close} />
                </div>
                <Account model={model} />
            </aside>
            <div className='relative z-10 flex min-w-0 flex-1 flex-col md:h-full'>
                <header className='troxe-appbar troxe-glass sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-border px-4'>
                    <button
                        type='button'
                        ref={toggle}
                        onClick={() => setOpen((current) => !current)}
                        aria-expanded={open}
                        aria-controls='troxe-nav'
                        aria-label={open ? 'Close navigation' : 'Open navigation'}
                        className='troxe-icon-btn md:hidden'
                    >
                        <NamedIcon name='menu' className={icon} aria-hidden />
                    </button>
                    {/* The brand travels with the header on a phone, exactly as it does in the rail. */}
                    <PanelLink
                        destination={{ to: '/' }}
                        aria-label={model.brand.name}
                        className='flex min-w-0 shrink items-center gap-2 no-underline md:hidden'
                    >
                        {model.brand.logoUrl && <img src={model.brand.logoUrl} alt='' className='h-7 w-auto shrink-0' />}
                        <span className='truncate fs-tiny font-extrabold uppercase tracking-[0.2em] text-foreground'>
                            {model.brand.name}
                        </span>
                    </PanelLink>
                    <span className='hidden min-w-0 flex-1 md:block' aria-hidden />
                    <div className='ml-auto flex shrink-0 items-center gap-1 md:gap-2'>
                        <SchemeToggle model={model} />
                        <View name='app.search' className={row} />
                    </div>
                </header>
                {/* Dimmed behind the drawer, the page also steps out of the keyboard's way; the header
                    keeps its own close button so tabbing never gets stuck. */}
                <div className='min-w-0 flex-1 overflow-y-auto' inert={open}>
                    <Main className='p-4 pb-24 md:p-8 md:pb-8'>{children}</Main>
                </div>
            </div>
            <TabBar area={area} rootAdmin={user.rootAdmin} open={open} />
        </div>
    );
}
