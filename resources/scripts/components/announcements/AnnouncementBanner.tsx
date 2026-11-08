import { useState } from 'react';
import { AlertOctagon, AlertTriangle, ArrowUpRight, Check, CheckCircle2, Info, Megaphone, X, type LucideIcon } from 'lucide-react';
import type { AnnouncementKind } from '@/api/admin/announcements/queries';
import Badge from '@/components/elements/Badge';
import Markdown from '@/components/elements/Markdown';
import { cn } from '@/lib/cn';
import type { UiTone } from '@/themes/skins';

interface KindMeta {
    label: string;
    Icon: LucideIcon;
    tone: UiTone;
}

/** Kind → tone + icon + text label; colour alone never carries the meaning. */
export const kindMeta = {
    info: { label: 'Information', Icon: Info, tone: 'info' },
    success: { label: 'Success', Icon: CheckCircle2, tone: 'success' },
    warning: { label: 'Warning', Icon: AlertTriangle, tone: 'warning' },
    critical: { label: 'Critical', Icon: AlertOctagon, tone: 'danger' },
} satisfies Record<AnnouncementKind, KindMeta>;

/**
 * The surface takes the kind's colour, so a notice is readable as a coloured block rather
 * than as a card with one small coloured chip. Same tokens as the soft `Badge`, which keeps
 * both colour schemes in step. The icon and the written label stay, so colour is never the
 * only signal.
 */
const kindSurface = {
    info: { root: 'border-primary/45 bg-primary/10', chip: 'border-primary/45 bg-primary/15 text-primary' },
    success: { root: 'border-success/45 bg-success/10', chip: 'border-success/45 bg-success/15 text-success' },
    warning: { root: 'border-warning/45 bg-warning/10', chip: 'border-warning/45 bg-warning/15 text-warning' },
    critical: {
        root: 'border-destructive/45 bg-destructive/10',
        chip: 'border-destructive/45 bg-destructive/15 text-destructive',
    },
} satisfies Record<AnnouncementKind, { root: string; chip: string }>;

export const formatInstant = (value: string): string | null => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const formatWindow = (start: string | null, end: string | null): string | null => {
    const a = start ? formatInstant(start) : null;
    const b = end ? formatInstant(end) : null;

    if (a && b) {
        return `${a} → ${b}`;
    }

    if (a) {
        return `Starts ${a}`;
    }

    if (b) {
        return `Until ${b}`;
    }

    return null;
};

export interface AnnouncementBannerProps {
    kind: AnnouncementKind;
    title: string;
    body: string;
    policy?: string;
    requireAck?: boolean;
    ackedAt?: string | null;
    actionLabel?: string | null;
    actionUrl?: string | null;
    eventStart?: string | null;
    eventEnd?: string | null;
    /** Optional tag brand — colour chip + icon shown above the title. */
    tag?: { readonly name: string; readonly color: string; readonly icon: string | null } | null;
    onAck?: () => void;
    onDismiss?: () => void;
    ackBusy?: boolean;
    dismissBusy?: boolean;
    /** Admin live preview: renders the exact same markup without action handlers. */
    preview?: boolean;
}

interface BannerActionsProps {
    policy?: string;
    requireAck: boolean;
    acked: boolean;
    actionLabel?: string | null;
    actionUrl?: string | null;
    onAck?: () => void;
    onDismiss: () => void;
    ackBusy: boolean;
    dismissBusy: boolean;
    preview: boolean;
}

interface BannerBadgesProps {
    label: string;
    tone: UiTone;
    policy?: string;
    acked: boolean;
    preview: boolean;
    tag?: { readonly name: string; readonly color: string; readonly icon: string | null } | null;
}

/** Status badges above the title: kind, an ack-required hint, and an acked tick. */
function BannerBadges({ label, tone, policy, acked, preview, tag }: BannerBadgesProps) {
    const showAckRequired = policy === 'until_ack' && !acked && !preview;

    return (
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            {tag && (
                <Badge tone='neutral' size='sm' variant='soft' className='trx:flex trx:items-center trx:gap-1.5'>
                    {tag.icon && <span className='trx:size-3 trx:shrink-0' aria-hidden>{tag.icon}</span>}
                    <span className='trx:truncate' style={{ color: tag.color }}>
                        {tag.name}
                    </span>
                </Badge>
            )}
            <Badge tone={tone} size='sm' variant='soft'>
                {label}
            </Badge>
            {showAckRequired && (
                <Badge tone='neutral' size='sm' variant='soft'>
                    Acknowledgement required
                </Badge>
            )}
            {acked && (
                <Badge tone='success' size='sm' variant='soft'>
                    <span className='inline-flex items-center gap-1'>
                        <Check size={11} aria-hidden='true' /> Acknowledged
                    </span>
                </Badge>
            )}
        </div>
    );
}

function BannerActions({
    policy,
    requireAck,
    acked,
    actionLabel,
    actionUrl,
    onAck,
    onDismiss,
    ackBusy,
    dismissBusy,
    preview,
}: BannerActionsProps) {
    const needsAck = (policy === 'until_ack' || requireAck) && !acked;
    const canHide = !requireAck || acked;
    const showDismiss = canHide && policy !== 'until_ack' && !preview;

    return (
        <div className='mt-3 flex flex-wrap items-center gap-2'>
            {actionLabel && actionUrl && (
                <a
                    href={actionUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    tabIndex={preview ? -1 : 0}
                    onClick={preview ? (event) => event.preventDefault() : undefined}
                    className='inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90'
                >
                    {actionLabel}
                    <ArrowUpRight size={14} aria-hidden='true' />
                </a>
            )}
            {!preview && needsAck && onAck && (
                <button
                    type='button'
                    onClick={onAck}
                    disabled={ackBusy}
                    className='inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-bold text-foreground transition hover:border-primary disabled:opacity-60'
                >
                    {ackBusy ? 'Saving…' : 'Got it, acknowledge'}
                </button>
            )}
            {showDismiss && (
                <button
                    type='button'
                    aria-label='Dismiss announcement'
                    disabled={dismissBusy}
                    onClick={onDismiss}
                    className='inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60'
                >
                    <X size={14} aria-hidden='true' />
                    Dismiss
                </button>
            )}
        </div>
    );
}

/**
 * The single banner component used by both the user dashboard and the admin
 * preview — one implementation means the preview cannot drift from what users
 * actually see. Body is rendered as plain text, never HTML.
 */
export default function AnnouncementBanner({
    kind,
    title,
    body,
    policy,
    requireAck = false,
    ackedAt = null,
    actionLabel,
    actionUrl,
    eventStart,
    eventEnd,
    tag,
    onAck,
    onDismiss,
    ackBusy = false,
    dismissBusy = false,
    preview = false,
}: AnnouncementBannerProps) {
    const [dismissedLocally, setDismissedLocally] = useState(false);
    const meta = kindMeta[kind] ?? kindMeta.info;
    const surface = kindSurface[kind] ?? kindSurface.info;
    const { Icon } = meta;
    const acked = !!ackedAt;
    const windowText = formatWindow(eventStart ?? null, eventEnd ?? null);
    const windowPrefix = kind === 'critical' || kind === 'warning' ? 'Maintenance window: ' : 'Event: ';

    if (dismissedLocally) {
        return null;
    }

    const TagIcon = Megaphone;
    return (
        <article
            role={kind === 'critical' ? 'alert' : 'status'}
            aria-label={`${meta.label}: ${title}`}
            className={cn(
                'relative overflow-hidden rounded-2xl border shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm',
                surface.root
            )}
        >
            <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent'
            />
            <div className='flex items-start gap-3.5 p-4 sm:p-5'>
                <span
                    className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                        surface.chip
                    )}
                >
                    <Icon size={20} aria-hidden='true' />
                </span>
                <div className='min-w-0 flex-1'>
                    <BannerBadges
                        label={meta.label}
                        tone={meta.tone}
                        policy={policy}
                        acked={acked}
                        preview={preview}
                        tag={tag ?? null}
                    />
                    <h3 className='mt-1.5 text-base font-extrabold leading-snug tracking-tight text-foreground'>
                        {title}
                    </h3>
                    {/* Markdown rendered as safe React nodes (no raw HTML). */}
                    <div className='mt-1'>
                        <Markdown>{body}</Markdown>
                    </div>
                    {windowText && (
                        <p className='mt-2 font-mono text-xs text-muted-foreground'>
                            {windowPrefix}
                            {windowText}
                        </p>
                    )}
                    <BannerActions
                        policy={policy}
                        requireAck={requireAck}
                        acked={acked}
                        actionLabel={actionLabel}
                        actionUrl={actionUrl}
                        onAck={onAck}
                        ackBusy={ackBusy}
                        dismissBusy={dismissBusy}
                        preview={preview}
                        onDismiss={() => {
                            if (policy === 'every_visit' && !requireAck) {
                                setDismissedLocally(true);
                            }
                            onDismiss?.();
                        }}
                    />
                </div>
            </div>
        </article>
    );
}
