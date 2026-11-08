import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type OnChangeFn,
    type PaginationState,
    type SortingState,
} from '@tanstack/react-table';
import { History, Users } from 'lucide-react';
import { httpErrorToHuman } from '@/api/http';
import {
    outcomeMeta,
    useAdminUserIpHistory,
    type AdminLoginEventListParams,
    type LoginEventItem,
} from '@/api/admin/loginEvents/queries';
import { useCurrentResource } from '@/extensions/resourceContext';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import Badge from '@/components/elements/Badge';
import DataTable from '@/components/elements/table/DataTable';
import DataTableColumnHeader from '@/components/elements/table/DataTableColumnHeader';
import DataTablePagination from '@/components/elements/table/DataTablePagination';
import { actionsColumn, RowActionButton, RowActions } from '@/components/elements/table/RowActions';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import { NewButton } from '@/components/elements/NewButton';
import AddressAccountsDialog from '@/components/admin/users/AddressAccountsDialog';
import { useIpHistorySearch } from '@/router/userIpHistorySearch';

const emptyEvents: LoginEventItem[] = [];
const sortableFields = ['created_at'] as const;

const fmt = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const sortingFromSearch = (sort?: string): SortingState => {
    if (!sort) {
        return [];
    }

    const desc = sort.startsWith('-');

    return [{ id: desc ? sort.slice(1) : sort, desc }];
};

const outcomeOptions = [
    { value: '', label: 'Every attempt' },
    { value: 'success', label: 'Signed in' },
    { value: 'failed', label: 'Failed credentials' },
    { value: 'banned', label: 'Refused by a ban' },
    { value: 'suspended', label: 'Refused while suspended' },
    { value: 'throttled', label: 'Rate limited' },
    { value: 'checkpoint', label: 'Second factor' },
];

interface Props {
    event: LoginEventItem;
}

/** Which other accounts this address has been used for, opened from the row it was seen on. */
const AddressAccountsAction = ({ event }: Props) => {
    const ip = event.attributes.ip;
    const [open, setOpen] = useState(false);

    if (!ip) {
        return null;
    }

    return (
        <RowActions>
            <RowActionButton
                icon={Users}
                label='Other accounts at this address'
                aria-label={`Accounts that signed in from ${ip}`}
                onClick={() => setOpen(true)}
            />
            {open && <AddressAccountsDialog open onClose={() => setOpen(false)} ip={ip} />}
        </RowActions>
    );
};

const ipHistoryColumns = [
    {
        id: 'ip',
        accessorFn: (event: LoginEventItem) => event.attributes.ip,
        header: 'Address',
        cell: ({ row }) => (
            <span
                className='block truncate font-mono text-sm text-foreground'
                title={row.original.attributes.ip ?? undefined}
            >
                {row.original.attributes.ip ?? <span className='text-muted-foreground'>no address recorded</span>}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-44', cellClassName: 'w-44' },
    },
    {
        id: 'outcome',
        accessorFn: (event: LoginEventItem) => event.attributes.outcome,
        header: 'Result',
        cell: ({ row }) => {
            const meta = outcomeMeta(row.original.attributes.outcome);

            return (
                <Badge tone={meta.tone} size='sm' variant='soft'>
                    <span title={meta.detail}>{meta.label}</span>
                </Badge>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'w-32', cellClassName: 'w-32' },
    },
    {
        id: 'account',
        accessorFn: (event: LoginEventItem) => event.attributes.username_attempted,
        header: 'Attempted as',
        cell: ({ row }) => (
            <span
                className='block truncate text-sm text-muted-foreground'
                title={row.original.attributes.username_attempted ?? undefined}
            >
                {row.original.attributes.username_attempted ?? '—'}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
    },
    {
        id: 'created_at',
        accessorFn: (event: LoginEventItem) => event.attributes.created_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title='When' />,
        cell: ({ row }) => (
            <span className='font-mono text-xs text-muted-foreground'>{fmt(row.original.attributes.created_at)}</span>
        ),
        enableSorting: true,
        meta: { headerClassName: 'hidden w-44 @xl:table-cell', cellClassName: 'hidden w-44 @xl:table-cell' },
    },
    actionsColumn<LoginEventItem>(1, (event) => <AddressAccountsAction event={event} />),
] satisfies ColumnDef<LoginEventItem>[];

export default function UserIpHistoryTab() {
    const resource = useCurrentResource();

    if (resource?.kind !== 'admin.user') {
        throw new Error('An IP history tab was rendered without its user.');
    }

    const userId = resource.resource.attributes.id;
    const { page, ip, outcome, sort, navigateToSearch } = useIpHistorySearch();
    const [addressLookup, setAddressLookup] = useState(ip);
    const params = useMemo<AdminLoginEventListParams>(
        () => ({ page, ip: ip || undefined, outcome, sort: sort || undefined }),
        [ip, outcome, page, sort]
    );
    const {
        data: events,
        error,
        isFetching,
        refetch,
    } = useAdminUserIpHistory(userId, params, {
        placeholderData: keepPreviousData,
    });
    const metadata = events?.meta.pagination;
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
        data: events?.data ?? emptyEvents,
        columns: ipHistoryColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (event) => String(event.attributes.id),
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
        <TitledGreyBox title='Sign-in history'>
            <div className='mb-3 flex flex-wrap items-center gap-2'>
                <form
                    className='flex items-center gap-2'
                    onSubmit={(event) => {
                        event.preventDefault();
                        navigateToSearch({ page: 1, ip: addressLookup });
                    }}
                >
                    <input
                        aria-label='Find attempts from one address'
                        className='h-9 w-56 rounded-lg border border-border bg-card px-2 font-mono text-sm text-foreground'
                        placeholder='203.0.113.7'
                        value={addressLookup}
                        onChange={(event) => setAddressLookup(event.target.value)}
                    />
                    <NewButton type='submit' isSecondary>
                        Find
                    </NewButton>
                </form>
                <select
                    aria-label='Filter by result'
                    className='h-9 w-48 rounded-lg border border-border bg-card px-2 text-sm text-foreground'
                    value={outcome ?? ''}
                    onChange={(event) => navigateToSearch({ page: 1, outcome: event.target.value || null })}
                >
                    {outcomeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <p className='mb-3 text-xs leading-relaxed text-muted-foreground'>
                Every address this account authenticated from, and every attempt that named it and failed, newest first.
                The history is kept for a fixed window and is read-only: nothing here can be edited or deleted by an
                administrator.
            </p>
            {events ? (
                <>
                    <DataTable
                        table={table}
                        tableClassName='table-fixed'
                        isFetching={isFetching}
                        emptyState={
                            <Empty size='compact'>
                                <EmptyHeader>
                                    <EmptyMedia variant='icon'>
                                        <History />
                                    </EmptyMedia>
                                    <EmptyTitle>No sign-in history</EmptyTitle>
                                    <EmptyDescription>
                                        {ip
                                            ? 'Nothing has been attempted from that address for this account.'
                                            : 'This account has not signed in, and no attempt has named it, inside the retention window.'}
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        }
                    />
                    <DataTablePagination
                        table={table}
                        total={events.meta.pagination.total}
                        count={events.meta.pagination.count}
                        itemLabel='attempts'
                    />
                </>
            ) : (
                <Spinner size='large' centered />
            )}
        </TitledGreyBox>
    );
}
