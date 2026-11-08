import type { ColumnDef } from '@tanstack/react-table';
import { Archive, BarChart3, Pause, Play, Send } from 'lucide-react';
import {
    deleteAnnouncementInput,
    useAnnouncementTransition,
    useDeleteAnnouncement,
    type AnnouncementItem,
    type AnnouncementPolicy,
    type AnnouncementStatus,
} from '@/api/admin/announcements/queries';
import AnnouncementFormDialog from '@/components/admin/announcements/AnnouncementFormDialog';
import AnnouncementStatsDialog from '@/components/admin/announcements/AnnouncementStatsDialog';
import { kindMeta } from '@/components/announcements/AnnouncementBanner';
import Badge from '@/components/elements/Badge';
import { Dialog } from '@/components/elements/dialog';
import DropdownMenu from '@/components/elements/dropdown/DropdownMenu';
import DataTableColumnHeader from '@/components/elements/table/DataTableColumnHeader';
import {
    actionsColumn,
    EditAction,
    RowActionButton,
    RowActions,
    RowActionsMenu,
} from '@/components/elements/table/RowActions';
import type { UiTone } from '@/themes/skins';

const statusTones = {
    draft: 'neutral',
    scheduled: 'info',
    published: 'success',
    paused: 'warning',
    archived: 'neutral',
} satisfies Record<AnnouncementStatus, UiTone>;

const policyLabels = {
    once: 'Once',
    every_visit: 'Every visit',
    interval: 'Repeating',
    until_ack: 'Until acknowledged',
} satisfies Record<AnnouncementPolicy, string>;

const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }) : '—';

interface Props {
    announcement: AnnouncementItem;
    archived: boolean;
}

const AnnouncementActionsCell = ({ announcement, archived }: Props) => {
    const { id, status, name } = announcement.attributes;
    const publish = useAnnouncementTransition('publish');
    const schedule = useAnnouncementTransition('schedule');
    const pause = useAnnouncementTransition('pause');
    const archive = useAnnouncementTransition('archive');
    const remove = useDeleteAnnouncement();

    const run = (mutation: { mutateAsync: (input: { id: number }) => Promise<unknown> }) =>
        void mutation.mutateAsync({ id }).catch(() => {
            // Error toast is handled by the mutation.
        });

    const publishAt = announcement.attributes.publish_at;
    const hasFuturePublish = !!publishAt && new Date(publishAt).getTime() > Date.now();

    if (archived) {
        return (
            <RowActions>
                <span className='px-2 text-xs text-muted-foreground'>Archived · read-only</span>
            </RowActions>
        );
    }

    return (
        <RowActions>
            <Dialog.Trigger trigger={({ onClick }) => <EditAction aria-label={`Edit ${name}`} onClick={onClick} />}>
                {({ open, onClose }) => (
                    <AnnouncementFormDialog announcement={announcement} open={open} onClose={onClose} />
                )}
            </Dialog.Trigger>
            {/* Outside the overflow menu on purpose: a menu unmounts its children when it closes,
                which would tear down a dialog opened from one of its items. */}
            <Dialog.Trigger
                trigger={({ onClick }) => (
                    <RowActionButton
                        icon={BarChart3}
                        label='Statistics'
                        aria-label={`Statistics for ${name}`}
                        onClick={onClick}
                    />
                )}
            >
                {({ open, onClose }) => (
                    <AnnouncementStatsDialog announcement={announcement} open={open} onClose={onClose} />
                )}
            </Dialog.Trigger>
            <RowActionsMenu label={`More actions for ${name}`}>
                {(status === 'draft' || status === 'scheduled' || status === 'paused') && hasFuturePublish && (
                    <DropdownMenu.Item
                        icon={Send}
                        onClick={() =>
                            void schedule.mutateAsync({ id, body: { publish_at: publishAt } }).catch(() => {
                                // Error toast is handled by the mutation.
                            })
                        }
                    >
                        Schedule for its start time
                    </DropdownMenu.Item>
                )}
                {(status === 'published' || status === 'scheduled') && (
                    <DropdownMenu.Item icon={Pause} onClick={() => run(pause)}>
                        Pause
                    </DropdownMenu.Item>
                )}
                {(status === 'draft' || status === 'scheduled' || status === 'paused') && (
                    <DropdownMenu.Item icon={Play} onClick={() => run(publish)}>
                        Publish now
                    </DropdownMenu.Item>
                )}
                <DropdownMenu.Item icon={Archive} onClick={() => run(archive)}>
                    Archive
                </DropdownMenu.Item>
                <Dialog.ConfirmTrigger
                    title='Delete announcement'
                    confirm='Delete'
                    onConfirmed={async (_event, close) => {
                        try {
                            await remove.mutateAsync(deleteAnnouncementInput(id));
                            close();
                        } catch {
                            // Error toast is handled by the mutation.
                        }
                    }}
                    trigger={({ onClick }) => <DropdownMenu.Item onClick={onClick}>Delete</DropdownMenu.Item>}
                >
                    <p className='text-sm leading-relaxed text-muted-foreground'>
                        Permanently deletes <strong className='text-foreground'>{name}</strong> and every stored
                        acknowledgement or dismissal. Published banners must be paused or archived first.
                    </p>
                </Dialog.ConfirmTrigger>
            </RowActionsMenu>
        </RowActions>
    );
};

export const announcementColumns = [
    {
        id: 'title',
        accessorFn: (announcement) => announcement.attributes.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title='Announcement' />,
        cell: ({ row }) => {
            const { title, name, content_version: contentVersion } = row.original.attributes;

            return (
                <div className='min-w-0'>
                    <span className='block truncate text-sm font-semibold text-foreground' title={title}>
                        {title}
                    </span>
                    <span className='block truncate text-xs text-muted-foreground'>
                        {name} · v{contentVersion}
                    </span>
                </div>
            );
        },
        enableSorting: true,
        meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
    },
    {
        id: 'tag',
        accessorFn: (announcement) => announcement.attributes.tag,
        header: 'Tag',
        cell: ({ row }) => {
            const tag = row.original.attributes.tag;

            if (!tag) {
                return <span className='text-xs text-muted-foreground'>—</span>;
            }

            return (
                <span className='trx:flex trx:items-center trx:gap-1 text-xs'>
                    <span
                        aria-hidden
                        className='trx:inline-block trx:shrink-0 trx:h-2 trx:w-2 trx:rounded-full'
                        style={{ backgroundColor: tag.color }}
                    />
                    <span className='trx:truncate' title={tag.name}>
                        {tag.name}
                    </span>
                </span>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-36 @xl:table-cell', cellClassName: 'hidden w-36 @xl:table-cell' },
    },
    {
        id: 'kind',
        accessorFn: (announcement) => announcement.attributes.kind,
        header: 'Kind',
        cell: ({ row }) => {
            const meta = kindMeta[row.original.attributes.kind];

            return (
                <Badge tone={meta.tone} size='sm' variant='soft'>
                    {meta.label}
                </Badge>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-32 @lg:table-cell', cellClassName: 'hidden w-32 @lg:table-cell' },
    },
    {
        id: 'status',
        accessorFn: (announcement) => announcement.attributes.status,
        header: 'Status',
        cell: ({ row }) => (
            <Badge tone={statusTones[row.original.attributes.status]} size='sm' variant='soft'>
                {row.original.attributes.status}
            </Badge>
        ),
        enableSorting: true,
        meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
    },
    {
        id: 'policy',
        accessorFn: (announcement) => announcement.attributes.policy,
        header: 'Repeats',
        cell: ({ row }) => {
            const { policy, require_ack: requireAck, interval_hours: intervalHours } = row.original.attributes;

            return (
                <span className='text-xs text-muted-foreground'>
                    {policyLabels[policy] ?? policy}
                    {policy === 'interval' && intervalHours ? ` · ${intervalHours}h` : ''}
                    {requireAck ? ' · ack' : ''}
                </span>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-40 @xl:table-cell', cellClassName: 'hidden w-40 @xl:table-cell' },
    },
    {
        id: 'window',
        accessorFn: (announcement) => announcement.attributes.publish_at,
        header: 'Window',
        cell: ({ row }) => (
            <span className='font-mono text-xs text-muted-foreground'>
                {fmt(row.original.attributes.publish_at)} → {fmt(row.original.attributes.expires_at)}
            </span>
        ),
        enableSorting: true,
        meta: { headerClassName: 'hidden w-56 @xl:table-cell', cellClassName: 'hidden w-56 @xl:table-cell' },
    },
    actionsColumn<AnnouncementItem>(3, (announcement) => (
        <AnnouncementActionsCell announcement={announcement} archived={announcement.attributes.status === 'archived'} />
    )),
] satisfies ColumnDef<AnnouncementItem>[];
