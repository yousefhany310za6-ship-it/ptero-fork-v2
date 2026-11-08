import {
    AlertOctagon,
    AlertTriangle,
    ArrowUpRight,
    Check,
    CheckCircle2,
    Info,
    X,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AnnouncementKind } from '@/api/admin/announcements/queries';
import Badge from '@/components/elements/Badge';
import Markdown from '@/components/elements/Markdown';
import { Dialog } from '@/components/elements/dialog';
import { kindMeta } from '@/components/announcements/AnnouncementBanner';

interface AnnouncementModalProps {
    kind: AnnouncementKind;
    title: string;
    body: string;
    tag?: { readonly name: string; readonly color: string; readonly icon: string | null } | null;
    actionLabel?: string | null;
    actionUrl?: string | null;
    eventStart?: string | null;
    eventEnd?: string | null;
    policy?: string;
    requireAck?: boolean;
    ackedAt?: string | null;
    onAck?: () => void;
    onDismiss: () => void;
    ackBusy?: boolean;
    dismissBusy?: boolean;
    open: boolean;
}

/** A centred popup the user must close before continuing — for critical notices that
   cannot be scrolled past unnoticed. Same badge/action language as the banner so
   users never have to learn two patterns. */
export default function AnnouncementModal({
    kind,
    title,
    body,
    tag,
    actionLabel,
    actionUrl,
    eventStart,
    eventEnd,
    policy,
    requireAck = false,
    ackedAt = null,
    onAck,
    onDismiss,
    ackBusy = false,
    dismissBusy = false,
    open,
}: AnnouncementModalProps) {
    const meta = kindMeta[kind] ?? kindMeta.info;
    const { Icon } = meta;
    const acked = !!ackedAt;
    const needsAck = (policy === 'until_ack' || requireAck) && !acked;

    return (
        <Dialog
            open={open}
            title={title}
            description={body}
            onClose={() => onDismiss()}
        >
            {tag && (
                <div className='mb-2 flex items-center gap-1.5'>
                    <span
                        aria-hidden
                        className='size-2 rounded-full border border-hairline'
                        style={{ backgroundColor: tag.color }}
                    />
                    <span className='fs-micro font-semibold uppercase tracking-[0.14em]' style={{ color: tag.color }}>
                        {tag.name}
                    </span>
                </div>
            )}
            <div className='mt-2 flex items-center gap-2'>
                <Badge tone={meta.tone} size='sm' variant='soft'>
                    {meta.label}
                </Badge>
                {policy === 'until_ack' && !acked && (
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
            <div className='mt-2 flex items-start gap-3'>
                <span
                    className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                        kind === 'critical'
                            ? 'border-destructive/45 bg-destructive/15 text-destructive'
                            : kind === 'warning'
                              ? 'border-warning/45 bg-warning/15 text-warning'
                              : kind === 'success'
                                ? 'border-success/45 bg-success/15 text-success'
                                : 'border-primary/45 bg-primary/15 text-primary'
                    )}
                >
                    <Icon className='size-4' aria-hidden='true' />
                </span>
                <div className='min-w-0'>
                    <Markdown>{body}</Markdown>
                </div>
            </div>
            <div className='mt-4 flex flex-wrap items-center gap-2 justify-end'>
                {actionLabel && actionUrl && (
                    <a
                        href={actionUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90'
                    >
                        {actionLabel}
                        <ArrowUpRight size={14} aria-hidden='true' />
                    </a>
                )}
                {!acked && needsAck && onAck && (
                    <button
                        type='button'
                        onClick={onAck}
                        disabled={ackBusy}
                        className='inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-bold text-foreground transition hover:border-primary disabled:opacity-60'
                    >
                        {ackBusy ? 'Saving…' : 'Got it, acknowledge'}
                    </button>
                )}
                <button
                    type='button'
                    aria-label='Close announcement'
                    disabled={dismissBusy}
                    onClick={onDismiss}
                    className='inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60'
                >
                    <X size={14} aria-hidden='true' />
                    {acked ? 'Close' : 'Dismiss'}
                </button>
            </div>
        </Dialog>
    );
}
