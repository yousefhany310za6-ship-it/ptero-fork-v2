import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type OnChangeFn,
    type PaginationState,
} from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { adminActivityLogsQueryOptions, type AdminActivityLog } from '@/api/admin/activity/queries';
import { relationshipAttributes } from '@/api/relationships';
import { httpErrorToHuman } from '@/api/http';
import { useCurrentResource } from '@/extensions/resourceContext';
import { eventLabel } from '@/views/activity';
import DataTable from '@/components/elements/table/DataTable';
import DataTablePagination from '@/components/elements/table/DataTablePagination';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import TitledGreyBox from '@/components/elements/TitledGreyBox';

const emptyLogs: AdminActivityLog[] = [];
const pageSize = 20;

const fmt = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type ActorAttributes = { username?: string; email?: string };

const actorName = (log: AdminActivityLog): string => {
    const actor = relationshipAttributes<ActorAttributes>(log.attributes.relationships?.actor);

    if (!actor) {
        return 'nobody named';
    }

    return actor.email ?? actor.username ?? 'nobody named';
};

const adminActionColumns = [
    {
        id: 'event',
        accessorFn: (log: AdminActivityLog) => log.attributes.event,
        header: 'Action',
        cell: ({ row }) => (
            <div className='min-w-0'>
                <span className='block truncate text-sm' title={row.original.attributes.event}>
                    {eventLabel(row.original.attributes.event)}
                </span>
                {row.original.attributes.description && (
                    <span
                        className='block truncate text-xs text-muted-foreground'
                        title={row.original.attributes.description}
                    >
                        {row.original.attributes.description}
                    </span>
                )}
            </div>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
    },
    {
        id: 'actor',
        accessorFn: (log: AdminActivityLog) => actorName(log),
        header: 'Performed by',
        cell: ({ row }) => (
            <span className='block truncate text-sm text-muted-foreground' title={actorName(row.original)}>
                {actorName(row.original)}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'hidden w-52 @xl:table-cell', cellClassName: 'hidden w-52 @xl:table-cell' },
    },
    {
        id: 'origin',
        accessorFn: (log: AdminActivityLog) => log.attributes.is_api,
        header: 'Via',
        cell: ({ row }) => (
            <span className='text-xs text-muted-foreground'>
                {row.original.attributes.is_api ? 'API key' : 'Panel'}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'hidden w-24 @2xl:table-cell', cellClassName: 'hidden w-24 @2xl:table-cell' },
    },
    {
        id: 'timestamp',
        accessorFn: (log: AdminActivityLog) => log.attributes.timestamp,
        header: 'When',
        cell: ({ row }) => (
            <span className='whitespace-nowrap font-mono text-xs text-muted-foreground'>
                {fmt(row.original.attributes.timestamp)}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'hidden w-44 @lg:table-cell', cellClassName: 'hidden w-44 @lg:table-cell' },
    },
] satisfies ColumnDef<AdminActivityLog>[];

export default function AdminActionsTab() {
    const resource = useCurrentResource();

    if (resource?.kind !== 'admin.user') {
        throw new Error('An admin actions tab was rendered without its user.');
    }

    const userId = resource.resource.attributes.id;
    const [page, setPage] = useState(1);
    const {
        data: logs,
        error,
        isFetching,
        refetch,
    } = useQuery({
        ...adminActivityLogsQueryOptions({ page, filters: { subject: userId }, sorts: { timestamp: -1 } }),
        placeholderData: keepPreviousData,
    });
    const metadata = logs?.meta.pagination;
    const pagination = useMemo<PaginationState>(() => ({ pageIndex: page - 1, pageSize }), [page]);
    const onPaginationChange = useCallback<OnChangeFn<PaginationState>>(
        (updater) => {
            const next = updater instanceof Function ? updater(pagination) : updater;

            if (next.pageIndex !== pagination.pageIndex) {
                setPage(next.pageIndex + 1);
            }
        },
        [pagination]
    );
    const table = useReactTable({
        data: logs?.data ?? emptyLogs,
        columns: adminActionColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (log) => log.attributes.id,
        manualPagination: true,
        rowCount: metadata?.total ?? 0,
        state: { pagination },
        onPaginationChange,
    });

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    return (
        <TitledGreyBox title='Administration of this account'>
            {logs ? (
                <>
                    <DataTable
                        table={table}
                        tableClassName='table-fixed'
                        isFetching={isFetching}
                        emptyState={
                            <Empty size='compact'>
                                <EmptyHeader>
                                    <EmptyMedia variant='icon'>
                                        <ScrollText />
                                    </EmptyMedia>
                                    <EmptyTitle>No administrative actions</EmptyTitle>
                                    <EmptyDescription>
                                        Nothing has been done to this account from the admin panel inside the retention
                                        window.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        }
                    />
                    <DataTablePagination
                        table={table}
                        total={logs.meta.pagination.total}
                        count={logs.meta.pagination.count}
                        itemLabel='actions'
                    />
                </>
            ) : (
                <Spinner size='large' centered />
            )}
            <p className='mt-3 text-xs leading-relaxed text-muted-foreground'>
                Every row here was written by the action it describes, and no screen — this one included — can change or
                remove one. Credentials never reach it: an action records what was decided, not the password, token or
                key that made it possible.
            </p>
        </TitledGreyBox>
    );
}
