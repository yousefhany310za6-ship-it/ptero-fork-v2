import React from 'react';
import { cn } from '@/lib/cn';
import {
    useAdminAnnouncementTags,
    useDeleteAnnouncementTag,
    type AnnouncementTag,
} from '@/api/admin/announcements/tag-queries';
import Button from '@/components/elements/Button';
import { ConfirmationDialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import AdminContentBlock from '@/components/admin/AdminContentBlock';
import AnnouncementTagFormDialog from './AnnouncementTagFormDialog';
import { Megaphone } from 'lucide-react';
import DataTable from '@/components/elements/table/DataTable';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';

export default function AnnouncementTagManager() {
    const { data: tags, isFetching } = useAdminAnnouncementTags();
    const deleteTag = useDeleteAnnouncementTag();
    const [open, setOpen] = React.useState(false);
    const [editingTag, setEditingTag] = React.useState<AnnouncementTag | null>(null);
    const [deletingId, setDeletingId] = React.useState<number | null>(null);
    const [confirmOpen, setConfirmOpen] = React.useState(false);

    const handleDelete = (tag: AnnouncementTag) => {
        setDeletingId(tag.id);
        setConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        try {
            await deleteTag.mutateAsync(deletingId);
        } finally {
            setDeletingId(null);
            setConfirmOpen(false);
        }
    };

    if (isFetching) {
        return (
            <AdminContentBlock title='Announcement Tags'>
                <div className='flex h-64 items-center justify-center'>
                    <Spinner size='medium' />
                </div>
            </AdminContentBlock>
        );
    }

    const table = useReactTable({
        data: tags ?? [],
        getCoreRowModel: getCoreRowModel(),
        columns: [
            {
                accessorKey: 'name',
                header: 'Name',
                cell: ({ row }) => <span className='font-semibold text-foreground'>{row.getValue<string>()}</span>,
            },
            {
                accessorKey: 'color',
                header: 'Colour',
                cell: ({ row }) => {
                    const color = row.getValue<string>();
                    return (
                        <span className='flex items-center gap-2'>
                            <span
                                aria-hidden
                                className='size-3 rounded-full border border-hairline'
                                style={{ backgroundColor: color }}
                            />
                            <span className='font-mono text-xs text-ink-muted'>{color}</span>
                        </span>
                    );
                },
            },
            {
                accessorKey: 'icon',
                header: 'Icon',
                cell: ({ row }) => (
                    <span className='font-mono text-xs text-ink-muted'>
                        {row.getValue<string | null>() ?? '—'}
                    </span>
                ),
            },
            {
                accessorKey: 'announcements',
                header: 'Announcements',
                cell: ({ row }) => (
                    <span className='font-mono text-xs text-ink-muted'>{row.getValue<number>()}</span>
                ),
            },
            {
                id: 'actions',
                cell: ({ row }) => {
                    const tag = row.original as AnnouncementTag;
                    return (
                        <div className='flex items-center gap-1'>
                            <Button
                                type='button'
                                size='small'
                                variant='ghost'
                                onClick={() => {
                                    setEditingTag(tag);
                                    setOpen(true);
                                }}
                            >
                                Edit
                            </Button>
                            <Button
                                type='button'
                                size='small'
                                variant='destructive'
                                onClick={() => handleDelete(tag)}
                            >
                                Delete
                            </Button>
                        </div>
                    );
                },
            },
        ],
    });

    return (
        <AdminContentBlock title='Announcement Tags'>
            <Megaphone className='mr-2 size-5' />
            <p className='mb-4 text-sm text-ink-muted'>
                Create reusable tags with a colour and icon to brand your announcements.
            </p>
            <div className='mb-4 flex items-center gap-2'>
                <Button type='button' onClick={() => { setEditingTag(null); setOpen(true); }}>
                    New tag
                </Button>
            </div>
            <DataTable table={table} />
            <AnnouncementTagFormDialog
                open={open}
                tag={editingTag}
                onClose={() => {
                    setOpen(false);
                    setEditingTag(null);
                }}
            />
            <ConfirmDialog
                open={confirmOpen}
                title='Delete tag'
                description='Announcements using this tag will keep their content but lose their badge colour and icon.'
                onConfirm={confirmDelete}
                onCancel={() => setConfirmOpen(false)}
                confirmLabel='Delete tag'
            />
        </AdminContentBlock>
    );
}
