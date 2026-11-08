import { skin, type PrimitiveState, type ThemeSkins, type UiTone } from '@pterodactyl/sdk/theme';

type ButtonState = PrimitiveState<'Button'>;

/** A stat tile says how far it is over, so its tone lands on the value and the edge above it. */
const tileInk: Record<UiTone, string> = {
    neutral: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    info: 'text-sky-400',
    accent: 'text-primary',
};

const tileEdge: Record<UiTone, string> = {
    neutral: 'bg-hairline-hover',
    success: 'bg-success/50',
    warning: 'bg-warning/50',
    danger: 'bg-destructive/50',
    info: 'bg-sky-400/45',
    accent: 'bg-primary/40',
};

/** The bar down the right edge of a list row answers with the same rule. */
const statusFills: Record<UiTone, string> = {
    neutral: 'bg-hairline-hover',
    success: 'bg-success/80',
    warning: 'bg-warning/80',
    danger: 'bg-destructive/80',
    info: 'bg-sky-400/70',
    accent: 'bg-primary/60',
};

/**
 * Fills aligned with new-troxe-hosting: primary is the brand action, semantic colors for state.
 */
const fills: Record<ButtonState['color'], string> = {
    primary: [
        'bg-primary text-primary-foreground',
        'shadow-[0_8px_24px_-14px_var(--brand-rim)]',
        'hover:not-disabled:opacity-90 hover:not-disabled:shadow-[0_10px_26px_-12px_var(--brand-rim)]',
        'active:not-disabled:translate-y-px',
    ].join(' '),
    grey: [
        'bg-console-raised text-foreground border border-hairline',
        'hover:not-disabled:border-hairline-hover hover:not-disabled:bg-veil',
    ].join(' '),
    green: 'bg-success text-success-foreground shadow-[0_8px_20px_-14px_color-mix(in_oklab,var(--success)_60%,transparent)] hover:not-disabled:bg-success/85',
    red: [
        'bg-destructive text-destructive-foreground',
        'shadow-[0_8px_24px_-14px_color-mix(in_oklab,var(--destructive)_55%,transparent)]',
        'hover:not-disabled:bg-destructive/85',
    ].join(' '),
    orange: 'bg-caution text-caution-foreground shadow-[0_8px_20px_-14px_color-mix(in_oklab,var(--caution)_55%,transparent)] hover:not-disabled:bg-caution/85',
};

/** Every text control shares one recipe: a soft hairline box that lifts on focus. */
const control = ({ light, error }: PrimitiveState<'Input'>) =>
    [
        'resize-none appearance-none outline-hidden w-full min-w-0 rounded-xl px-3.5 py-2.5 fs-small',
        'transition-[background-color,border-color,color,box-shadow] duration-150',
        light ? 'bg-transparent border border-hairline text-foreground' : 'bg-input border border-hairline text-foreground',
        'placeholder:text-ink-muted hover:border-hairline-hover',
        'focus:border-primary/60 focus:ring-2 focus:ring-primary/25',
        'disabled:opacity-60 read-only:cursor-text read-only:bg-veil/40',
        error && 'border-destructive/60 text-destructive focus:border-destructive focus:ring-destructive/30',
    ]
        .filter(Boolean)
        .join(' ');

/**
 * Class recipes by primitive and part; a part left out keeps classic's recipe. `npx pterodactyl-theme
 * skins Button` copies classic's skins of a primitive into src/skins to start from.
 */
export const skins: ThemeSkins = {
    // Replaces the root recipe; the spinner and label keep classic's.
    Button: skin('Button', {
        root: ({ color, size, secondary }) =>
            [
                // The design system's `.btn`: a pill, bold, and a quick press.
                'relative inline-flex items-center justify-center gap-2 rounded-full font-bold outline-none transition-[background-color,border-color,box-shadow,transform,color] duration-150 disabled:opacity-40',
                'focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                size === 'xsmall' ? 'h-7 px-3 fs-tiny' : size === 'small' ? 'h-8 px-3.5 fs-small' : 'h-9 px-4 fs-small',
                size === 'xlarge' && 'w-full',
                secondary
                    ? 'border border-hairline bg-transparent text-ink-secondary hover:not-disabled:border-hairline-hover hover:not-disabled:text-foreground'
                    : fills[color],
            ]
                .filter(Boolean)
                .join(' '),
    }),

    // Builds on classic's card: `below(extra)` is its classes with `extra` merged in.
    Card: skin('Card', {
        root: (state, below) => below('troxe-card rounded-2xl border-hairline bg-console shadow-sm'),
    }),

    Input: skin('Input', { root: control }),
    TextArea: skin('TextArea', { root: control }),
    NumberInput: skin('NumberInput', { input: control }),

    FileInput: skin('FileInput', {
        root: [
            'block w-full min-w-0 rounded-xl border border-dashed border-hairline bg-veil/40 p-3 fs-small text-ink-secondary',
            'file:mr-3 file:rounded-full file:border file:border-hairline file:bg-console file:px-3.5 file:py-1.5',
            'file:fs-tiny file:font-bold file:text-foreground file:transition-colors',
            'enabled:cursor-pointer enabled:hover:border-primary/50 enabled:hover:file:border-primary/50',
            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/35',
            'disabled:cursor-default disabled:opacity-60',
        ].join(' '),
    }),

    Label: skin('Label', {
        root: 'block mb-1.5 fs-tiny font-semibold uppercase tracking-[0.1em] text-ink-secondary',
    }),

    Checkbox: skin('Checkbox', {
        root: [
            'flex shrink-0 size-4 cursor-pointer items-center justify-center rounded-[0.3rem] border',
            'bg-input border-hairline text-primary-foreground transition-[background-color,border-color,box-shadow] duration-100',
            'hover:border-primary/60',
            'data-checked:border-primary data-checked:bg-primary data-checked:shadow-[0_0_10px_-2px_var(--brand-rim)]',
            'data-indeterminate:border-primary data-indeterminate:bg-primary',
            'data-disabled:cursor-default data-disabled:opacity-50',
            '[&_svg]:size-3',
        ].join(' '),
    }),

    Switch: skin('Switch', {
        root: { base: 'flex gap-4', variants: { described: { true: 'items-start', false: 'items-center' } } },
        control: [
            'group relative inline-block shrink-0 w-12 h-6 rounded-full border cursor-pointer select-none p-0',
            'bg-input border-input-border transition-colors duration-150',
            'hover:border-primary/70 active:bg-popover data-checked:border-primary data-checked:bg-primary',
            'data-checked:shadow-[0_0_16px_-4px_var(--brand-rim)]',
            'data-disabled:opacity-60 data-disabled:cursor-default',
        ].join(' '),
        thumb: [
            'block absolute top-1/2 left-0.5 size-4.5 -translate-y-1/2 rounded-full border bg-background',
            'transition-[left] duration-150 ease-out',
            'group-data-checked:left-[calc(100%_-_1.125rem_-_0.125rem)]',
            'group-data-checked:bg-primary-foreground group-data-checked:border-primary-foreground',
        ].join(' '),
        text: 'min-w-0 flex-1',
        label: 'cursor-pointer mb-0',
        description: 'input-help',
    }),

    Select: skin('Select', {
        root: ({ error }) =>
            [
                'relative flex w-full items-center rounded-xl border fs-small transition-colors duration-150',
                'bg-input border-hairline text-foreground hover:border-hairline-hover',
                'focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/25',
                'data-disabled:cursor-default data-disabled:opacity-60',
                error && 'border-destructive/60 text-destructive',
            ]
                .filter(Boolean)
                .join(' '),
        input: [
            'w-full min-w-0 appearance-none border-0 bg-transparent px-3.5 py-2.5 pr-10 fs-small text-foreground',
            'outline-hidden placeholder:text-ink-muted focus:ring-0 disabled:cursor-default',
        ].join(' '),
        trigger:
            'absolute right-0 top-0 flex h-full w-9 items-center justify-center border-0 bg-transparent p-0 text-ink-muted transition-colors hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0',
        positioner: 'z-99999 min-w-(--anchor-width) outline-none',
        popup: [
            'rounded-xl border border-hairline bg-console-raised py-1 fs-small text-foreground shadow-lg',
            'w-(--anchor-width) max-w-(--available-width) max-h-[min(18rem,var(--available-height))]',
        ].join(' '),
        list: 'max-h-72 overflow-y-auto overscroll-contain outline-none',
        item: [
            'flex cursor-pointer select-none items-center justify-between rounded-lg px-3 py-2 outline-none',
            'data-highlighted:bg-veil data-selected:text-primary data-selected:font-semibold data-disabled:cursor-default data-disabled:opacity-50',
        ].join(' '),
        itemLabel: 'min-w-0',
        empty: 'px-3 py-2 fs-small text-ink-muted empty:p-0',
        groupLabel: 'px-3 pt-2 pb-1 fs-micro uppercase tracking-[0.1em] text-ink-muted empty:hidden',
        summary: 'pointer-events-none whitespace-nowrap px-3.5 py-2.5 fs-small text-foreground',
        preview: {
            base: 'pointer-events-none flex min-w-0 flex-1 items-center rounded-lg px-3 py-2 pr-10 fs-small',
            variants: { searching: { true: 'invisible' } },
        },
    }),

    // Dropdowns and context menus open on the raised console surface.
    DropdownMenu: skin('DropdownMenu', {
        positioner: 'z-9999 outline-hidden',
        root: [
            'min-w-56 rounded-xl border border-hairline bg-console-raised p-1.5 fs-small text-foreground shadow-lg',
            'origin-(--transform-origin) outline-none transition duration-150 ease-out',
            'data-starting-style:opacity-0 data-starting-style:scale-95 data-starting-style:translate-y-[-2px]',
            'data-ending-style:opacity-0 data-ending-style:scale-95',
        ].join(' '),
    }),

    DropdownMenuItem: skin('DropdownMenuItem', {
        root: {
            base: [
                'group flex w-full cursor-pointer select-none gap-2.5 rounded-lg px-2.5 py-2 outline-none',
                'text-foreground transition-colors data-highlighted:bg-veil',
            ].join(' '),
            variants: {
                described: { true: 'items-start', false: 'items-center' },
                danger: { true: 'text-destructive data-highlighted:bg-destructive/10' },
                checked: { true: 'bg-veil text-primary' },
            },
        },
        icon: {
            base: [
                'flex size-7 shrink-0 items-center justify-center rounded-lg border border-hairline bg-veil',
                'text-ink-muted transition-colors group-data-highlighted:border-hairline-hover group-data-highlighted:text-foreground',
            ].join(' '),
            variants: {
                described: { true: 'mt-0.5' },
                danger: { true: 'border-destructive/30 bg-destructive/10 text-destructive' },
            },
        },
        glyph: 'size-3.5',
        text: 'flex min-w-0 flex-1 flex-col',
        label: 'truncate fs-small font-semibold leading-5',
        description: {
            base: 'mt-0.5 fs-micro leading-4 text-ink-muted',
            variants: { danger: { true: 'text-destructive/80' } },
        },
    }),

    Tooltip: skin('Tooltip', {
        root: 'pointer-events-none z-9999 max-w-[24rem] rounded-lg border border-hairline bg-console-raised px-2.5 py-1.5 fs-tiny text-ink-secondary shadow-lg',
        arrow: {
            base: 'absolute size-2.5 border-hairline bg-console-raised',
            variants: {
                side: {
                    top: 'bottom-[-5px] left-0 border-b border-r',
                    bottom: 'top-[-5px] left-0 border-l border-t',
                    right: 'top-0 left-[-5px] border-r border-b',
                    left: 'top-0 right-[-5px] border-l border-t',
                },
            },
        },
    }),

    Code: skin('Code', {
        root: 'inline-block rounded-md bg-veil px-1.5 py-0.5 font-mono fs-small text-primary',
    }),

    CopyOnClick: skin('CopyOnClick', {
        root: 'fixed right-0 bottom-0 z-50 m-4',
        status: 'rounded-full border border-hairline bg-console-raised px-3.5 py-1.5 fs-tiny font-semibold text-foreground shadow-lg',
        target: 'cursor-pointer',
    }),

    Dialog: skin('Dialog', {
        backdrop: [
            'fixed inset-0 z-40 bg-black/65 backdrop-blur-[3px] transition-opacity duration-150 ease-out',
            'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:ease-in',
        ].join(' '),
        viewport: 'fixed inset-0 z-50 overflow-y-auto',
        container: 'flex min-h-full items-center justify-center p-4',
        root: [
            'relative mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-2xl text-left',
            'border border-hairline bg-console shadow-xl transition duration-150 ease-out',
            'max-h-[calc(100dvh-2rem)]',
            'data-starting-style:opacity-0 data-starting-style:scale-95 data-starting-style:translate-y-1',
            'data-ending-style:opacity-0 data-ending-style:scale-95 data-ending-style:ease-in',
        ].join(' '),
        body: 'flex min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6',
        content: 'flex-1 min-w-0',
        header: 'flex items-center',
        title: {
            base: 'pr-4 fs-lead font-bold tracking-tight text-foreground',
            variants: { described: { true: 'mb-1.5', false: 'mb-1' } },
        },
        description: 'mb-4 fs-small leading-relaxed text-ink-secondary',
        spacer: 'invisible h-4',
        footer: 'flex flex-wrap items-center justify-end gap-3 border-t border-hairline bg-veil/40 px-5 py-4 sm:px-6',
        close: 'absolute top-0 right-0 m-3',
        closeButton: 'troxe-icon-btn group',
        closeIcon: 'size-4 transition-transform duration-150 group-hover:rotate-90',
        icon: {
            base: 'mr-3.5 flex size-9 shrink-0 items-center justify-center rounded-xl border',
            variants: {
                type: {
                    danger: 'border-destructive/30 bg-destructive/10 text-destructive',
                    warning: 'border-warning/30 bg-warning/10 text-warning',
                    success: 'border-success/30 bg-success/10 text-success',
                    info: 'border-primary/30 bg-primary/10 text-primary',
                },
            },
        },
        iconGlyph: 'size-5',
    }),

    Table: skin('Table', {
        root: '@container overflow-hidden rounded-2xl border border-hairline bg-console',
        empty: { base: 'flex transition-opacity', variants: { fetching: { true: 'opacity-55' } } },
        scroller: 'overflow-x-auto scrollbar-thin scrollbar-thumb-(--scrollbar-thumb)',
        table: 'w-full border-collapse text-left fs-small',
        head: 'border-b border-hairline bg-veil/60',
        headerCell: 'h-10 whitespace-nowrap px-3 fs-micro font-semibold uppercase tracking-[0.12em] text-ink-muted',
        body: { base: 'divide-y divide-hairline transition-opacity', variants: { fetching: { true: 'opacity-55' } } },
        row: 'transition-colors hover:bg-veil/50',
        cell: 'px-3 py-2.5 align-middle text-foreground',
    }),

    Pagination: skin('Pagination', {
        root: 'mt-4 flex flex-wrap justify-center gap-1.5',
        page: 'size-9 rounded-full p-0',
    }),

    Empty: skin('Empty', {
        root: {
            base: 'flex min-w-0 flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-hairline bg-veil/30 p-6 text-center text-balance md:p-10',
            variants: { size: { compact: 'gap-4 md:p-8' } },
        },
        header: 'flex max-w-sm flex-col items-center gap-1.5 text-center',
        media: {
            base: 'mb-1 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
            variants: {
                variant: {
                    default: 'bg-transparent',
                    icon: 'troxe-badge-icon flex size-12 items-center justify-center [&_svg:not([class*="size-"])]:size-6',
                },
            },
        },
        title: 'fs-lead font-bold tracking-tight text-foreground',
        description: 'fs-small/relaxed text-ink-secondary [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        content: 'flex w-full max-w-sm min-w-0 flex-col items-center gap-3 fs-small text-balance',
    }),

    Alert: skin('Alert', {
        root: {
            base: [
                'flex items-start rounded-xl border px-4 py-3 fs-small text-foreground',
                'transition-colors duration-150',
            ].join(' '),
            variants: {
                type: {
                    success: 'border-success/30 bg-success/[0.08] border-l-2 border-l-success',
                    info: 'border-sky-500/30 bg-sky-500/[0.08] border-l-2 border-l-sky-400',
                    warning: 'border-warning/30 bg-warning/[0.08] border-l-2 border-l-warning',
                    danger: 'border-destructive/30 bg-destructive/[0.08] border-l-2 border-l-destructive',
                },
            },
        },
        icon: {
            base: 'mr-3 mt-0.5 size-5 shrink-0',
            variants: {
                type: {
                    success: 'text-success',
                    info: 'text-sky-400',
                    warning: 'text-warning',
                    danger: 'text-destructive',
                },
            },
        },
        body: 'min-w-0 flex-1 leading-relaxed',
        title: 'mb-1 font-semibold text-foreground',
        content: '',
    }),

    Badge: skin('Badge', {
        root: {
            base: 'rounded-full fs-micro font-semibold uppercase tracking-[0.08em]',
            variants: {
                size: { sm: 'px-2 py-0.5', md: 'px-2.5 py-1' },
                variant: { soft: 'border' },
            },
            compoundVariants: [
                { variant: 'solid', tone: 'neutral', class: 'bg-popover text-foreground' },
                { variant: 'solid', tone: 'success', class: 'bg-success text-success-foreground' },
                { variant: 'solid', tone: 'warning', class: 'bg-warning text-warning-foreground' },
                { variant: 'solid', tone: 'danger', class: 'bg-destructive text-destructive-foreground' },
                { variant: 'solid', tone: 'info', class: 'border border-sky-500/30 bg-sky-500/15 text-sky-300' },
                { variant: 'solid', tone: 'accent', class: 'border border-primary/30 bg-primary/15 text-primary' },
                { variant: 'soft', tone: 'neutral', class: 'border-hairline bg-veil text-ink-secondary' },
                { variant: 'soft', tone: 'success', class: 'border-success/25 bg-success/10 text-success' },
                { variant: 'soft', tone: 'warning', class: 'border-warning/25 bg-warning/10 text-warning' },
                { variant: 'soft', tone: 'danger', class: 'border-destructive/25 bg-destructive/10 text-destructive' },
                { variant: 'soft', tone: 'info', class: 'border-sky-500/25 bg-sky-500/10 text-sky-300' },
                { variant: 'soft', tone: 'accent', class: 'border-primary/25 bg-primary/10 text-primary' },
            ],
        },
    }),

    /**
     * A row of a list is a card that happens to be wide: the same hairline and sheen,
     * with a subtle hover lift inspired by new-troxe-hosting's console-lift.
     */
    ListRow: skin('ListRow', {
        root: {
            base: [
                'group relative flex items-center overflow-hidden rounded-xl border border-hairline',
                'bg-console p-4 text-foreground no-underline',
            ].join(' '),
            variants: {
                interactive: {
                    true: [
                        'transition-[background-color,border-color,box-shadow,transform] duration-150',
                        'hover:border-hairline-hover hover:bg-veil/30 hover:shadow-[0_12px_32px_-24px_rgba(0,0,0,0.5)] active:translate-y-px',
                        'focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20',
                    ].join(' '),
                },
            },
        },
        icon: 'troxe-badge-icon mr-3 flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4',
        title: 'min-w-0 fs-body font-semibold wrap-break-word',
        description: 'fs-tiny text-ink-secondary wrap-break-word line-clamp-2',
        // A bar down the row's right edge.
        status: ({ status }) =>
            `absolute right-0 z-20 m-1 h-[calc(100%-0.5rem)] w-1.5 rounded-full opacity-70 transition-opacity duration-150 group-hover:opacity-100 ${
                statusFills[status ?? 'neutral']
            }`,
    }),

    PageHeading: skin('PageHeading', {
        root: 'mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        text: 'min-w-0',
        title: 'fs-lead font-bold tracking-tight text-foreground sm:text-[1.35rem]',
        description: 'mt-1 fs-small leading-relaxed text-ink-secondary',
        actions: 'shrink-0',
    }),

    ChartCard: skin('ChartCard', {
        root: 'group troxe-card relative rounded-2xl border-hairline bg-console pt-2 shadow-sm',
        header: 'flex flex-wrap items-center justify-between gap-2 px-4 py-2',
        title: 'fs-body font-semibold text-foreground transition-colors duration-150 group-hover:text-primary',
        legend: 'flex items-center gap-2 fs-tiny text-ink-secondary',
        body: 'z-10 ml-2 min-w-0',
    }),

    ProgressBar: skin('ProgressBar', {
        root: {
            variants: {
                variant: {
                    meter: 'h-1.5 w-full overflow-hidden rounded-full bg-[var(--meter-track)]',
                    page: 'fixed h-0.5 w-full',
                },
            },
        },
        indicator: {
            variants: {
                variant: {
                    meter: 'h-full rounded-full transition-[width,background-color] duration-300',
                    page: 'h-full bg-primary shadow-progress transition-[width] duration-300 ease-in-out',
                },
                tone: {
                    neutral: 'bg-primary',
                    success: 'bg-success',
                    warning: 'bg-warning',
                    danger: 'bg-destructive',
                    info: 'bg-primary',
                    accent: 'bg-primary',
                },
            },
        },
    }),

    /**
     * A tile is one of the page's cards, so it keeps the same hairline and sheen; the tone only
     * colours the hairline along its top edge and the value itself.
     */
    Stat: skin('Stat', {
        root: ({ variant }) =>
            variant === 'tile'
                ? 'troxe-card troxe-card--link grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4'
                : 'flex flex-wrap justify-center',
        indicator: ({ variant, tone }) =>
            variant === 'tile' ? `absolute inset-x-0 top-0 h-px ${tileEdge[tone]}` : 'hidden',
        body: ({ variant }) => (variant === 'tile' ? 'flex w-full min-w-0 flex-col gap-1' : 'contents'),
        label: ({ variant }) =>
            variant === 'tile'
                ? 'truncate fs-micro font-semibold uppercase tracking-[0.14em] text-ink-muted'
                : 'sr-only',
        value: ({ tone, unavailable, variant }) =>
            variant === 'tile'
                ? `truncate fs-display font-extrabold leading-none tracking-tight tabular-nums ${
                      unavailable ? 'text-ink-muted' : tileInk[tone]
                  }`
                : 'fs-small',
        limit: ({ variant }) => (variant === 'tile' ? 'truncate fs-tiny text-ink-secondary' : 'fs-tiny'),
        icon: ({ variant, tone }) =>
            variant === 'tile'
                ? `flex size-9 shrink-0 items-center justify-center rounded-full border ${
                      tone === 'success'
                          ? 'border-success/30 bg-success/10 text-success'
                          : tone === 'warning'
                            ? 'border-warning/30 bg-warning/10 text-warning'
                            : tone === 'danger'
                              ? 'border-destructive/30 bg-destructive/10 text-destructive'
                              : tone === 'info'
                                ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                                : 'border-primary/25 bg-primary/10 text-primary'
                  }`
                : 'flex shrink-0 items-center text-ink-muted',
        glyph: ({ variant }) => (variant === 'tile' ? 'size-4' : 'size-3.5'),
    }),

    Spinner: skin('Spinner', {
        root: {
            base: 'block animate-[spin_1s_cubic-bezier(0.55,0.25,0.25,0.7)_infinite] rounded-full border-[var(--meter-track)] border-t-primary',
            variants: {
                blue: { true: 'border-primary/30 border-t-primary' },
                size: {
                    small: 'size-4 border-2',
                    base: 'size-8 border-[3px]',
                    large: 'size-16 border-[6px]',
                },
            },
        },
        container: {
            base: 'flex items-center justify-center',
            variants: { size: { small: 'm-6', base: 'm-6', large: 'm-20' } },
        },
    }),

    SpinnerOverlay: skin('SpinnerOverlay', {
        root: {
            base: 'left-0 top-0 z-40 flex h-full w-full flex-col items-center justify-center rounded-xl bg-console/75 backdrop-blur-[2px]',
            variants: { fixed: { true: 'fixed', false: 'absolute' } },
        },
        text: 'mt-4 fs-small text-ink-secondary',
    }),
};
