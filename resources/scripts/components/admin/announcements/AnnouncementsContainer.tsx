import { useCallback, useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
    getCoreRowModel,
    useReactTable,
    type OnChangeFn,
    type PaginationState,
    type SortingState,
} from '@tanstack/react-table';
import { Megaphone } from 'lucide-react';
import { httpErrorToHuman } from '@/api/http';
import { useAdminAnnouncements, type AnnouncementItem } from '@/api/admin/announcements/queries';
import AdminContentBlock from '@/components/admin/AdminContentBlock';
import AdminListEmpty from '@/components/admin/AdminListEmpty';
import CreateAnnouncementButton from '@/components/admin/announcements/CreateAnnouncementButton';
import { announcementColumns } from '@/components/admin/announcements/AnnouncementTable';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import DataTable from '@/components/elements/table/DataTable';
import DataTablePagination from '@/components/elements/table/DataTablePagination';
import { useAnnouncementListSearch } from '@/router/announcementsSearch';

const emptyAnnouncements: AnnouncementItem[] = [];
const sortableFields = ['updated_at', 'publish_at', 'created_at'] as const;

const sortingFromSearch = (sort?: string): SortingState => {
    if (!sort) {
        return [];
    }

    const desc = sort.startsWith('-');

    return [{ id: desc ? sort.slice(1) : sort, desc }];
};

const statusOptions = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active now' },
    { value: 'draft', label: 'Drafts' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'published', label: 'Published' },
    { value: 'paused', label: 'Paused' },
    { value: 'archived', label: 'Archived' },
];

export default function AnnouncementsContainer() {
    const { page, status, sort, navigateToSearch } = useAnnouncementListSearch();
    const params = useMemo(
        () => ({ page, status: status || undefined, sort: sort || undefined }),
        [page, status, sort]
    );
    const {
        data: announcements,
        error,
        isFetching,
        refetch,
    } = useAdminAnnouncements(params, { placeholderData: keepPreviousData });
    const metadata = announcements?.meta.pagination;
    const pagination = useMemo<PaginationState>(
        () => ({ pageIndex: page - 1, pageSize: metadata?.per_page ?? 50 }),
        [metadata?.per_page, page]
    );
    const sorting = useMemo(() => sortingFromSearch(sort), [sort]);
    const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
        (updater) => {
            const next = updater instanceof Function ? updater(pagination) : updater;

            if (next.pageIndex !== pagination.pageIndex) {
                navigateToSearch({ page: next.pageIndex + 1 });
            }
        },
        [navigateToSearch, pagination]
    );
    const onSortingChange = useCallback<OnChangeFn<SortingState>>(
        (updater) => {
            const next = updater instanceof Function ? updater(sorting) : updater;
            const primary = next[0];

            navigateToSearch({
                page: 1,
                sort:
                    primary && (sortableFields as readonly string[]).includes(primary.id)
                        ? `${primary.desc ? '-' : ''}${primary.id}`
                        : null,
            });
        },
        [navigateToSearch, sorting]
    );
    const table = useReactTable({
        data: announcements?.data ?? emptyAnnouncements,
        columns: announcementColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (announcement) => String(announcement.attributes.id),
        manualPagination: true,
        manualSorting: true,
        rowCount: metadata?.total ?? 0,
        enableMultiSort: false,
        state: { pagination, sorting },
        onPaginationChange,
        onSortingChange,
    });

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    return (
        <AdminContentBlock
            title='Admin · Announcements'
            heading='Announcements'
            description='Notices shown as banners at the top of the user dashboard — drafts, scheduling, acknowledgement policies, and reach.'
        >
            <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-center gap-2'>
                    <select
                        aria-label='Filter by status'
                        className='h-9 w-44 rounded-lg border border-border bg-card px-2 text-sm text-foreground'
                        value={status}
                        onChange={(event) => navigateToSearch({ page: 1, status: event.target.value || null })}
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <span className='hidden text-xs text-muted-foreground sm:inline'>
                        Sort by the column headers; the newest change comes first.
                    </span>
                </div>
                <CreateAnnouncementButton />
            </div>
            {announcements ? (
                <>
                    <DataTable
                        table={table}
                        tableClassName='table-fixed'
                        isFetching={isFetching}
                        emptyState={
                            <AdminListEmpty
                                icon={Megaphone}
                                noun='announcements'
                                filter={status}
                                onClearFilter={() => navigateToSearch({ page: 1, status: null })}
                                description='Create a notice to show it at the top of every targeted user’s dashboard.'
                                action={<CreateAnnouncementButton />}
                            />
                        }
                    />
                    <DataTablePagination
                        table={table}
                        total={announcements.meta.pagination.total}
                        count={announcements.meta.pagination.count}
                        itemLabel='announcements'
                    />
                </>
            ) : (
                <Spinner size='large' centered />
            )}
        </AdminContentBlock>
    );
}
