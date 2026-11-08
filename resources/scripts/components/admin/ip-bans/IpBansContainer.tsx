import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
    getCoreRowModel,
    useReactTable,
    type OnChangeFn,
    type PaginationState,
    type SortingState,
} from '@tanstack/react-table';
import { ShieldOff } from 'lucide-react';
import { httpErrorToHuman } from '@/api/http';
import { useAdminIpBans, type IpBanItem } from '@/api/admin/ipBans/queries';
import AdminContentBlock from '@/components/admin/AdminContentBlock';
import AdminListEmpty from '@/components/admin/AdminListEmpty';
import CreateIpBanButton from '@/components/admin/ip-bans/CreateIpBanButton';
import { ipBanColumns } from '@/components/admin/ip-bans/IpBanTable';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import { NewButton } from '@/components/elements/NewButton';
import DataTable from '@/components/elements/table/DataTable';
import DataTablePagination from '@/components/elements/table/DataTablePagination';
import { useIpBanListSearch } from '@/router/ipBansSearch';

const emptyBans: IpBanItem[] = [];
const sortableFields = ['created_at', 'expires_at'] as const;

const sortingFromSearch = (sort?: string): SortingState => {
    if (!sort) {
        return [];
    }

    const desc = sort.startsWith('-');

    return [{ id: desc ? sort.slice(1) : sort, desc }];
};

const statusOptions = [
    { value: '', label: 'All bans' },
    { value: 'active', label: 'Refusing sign-in now' },
    { value: 'permanent', label: 'Permanent' },
    { value: 'expired', label: 'Expired' },
];

export default function IpBansContainer() {
    const { page, ip, status, sort, navigateToSearch } = useIpBanListSearch();
    const [addressLookup, setAddressLookup] = useState(ip);
    const params = useMemo(
        () => ({ page, ip: ip || undefined, status, sort: sort || undefined }),
        [ip, page, sort, status]
    );
    const { data: bans, error, isFetching, refetch } = useAdminIpBans(params, { placeholderData: keepPreviousData });
    const metadata = bans?.meta.pagination;
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
        data: bans?.data ?? emptyBans,
        columns: ipBanColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (ban) => String(ban.attributes.id),
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
            title='Admin · IP Bans'
            heading='Network address bans'
            description='Addresses refused at sign-in, before any session exists. Bans reach the address, never the accounts behind it.'
        >
            <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex flex-wrap items-center gap-2'>
                    <form
                        className='flex items-center gap-2'
                        onSubmit={(event) => {
                            event.preventDefault();
                            navigateToSearch({ page: 1, ip: addressLookup });
                        }}
                    >
                        <input
                            aria-label='Find the ban covering an address'
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
                        aria-label='Filter by state'
                        className='h-9 w-44 rounded-lg border border-border bg-card px-2 text-sm text-foreground'
                        value={status ?? ''}
                        onChange={(event) => navigateToSearch({ page: 1, status: event.target.value || null })}
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                <CreateIpBanButton />
            </div>
            {bans ? (
                <>
                    <DataTable
                        table={table}
                        tableClassName='table-fixed'
                        isFetching={isFetching}
                        emptyState={
                            <AdminListEmpty
                                icon={ShieldOff}
                                noun='bans'
                                filter={ip}
                                onClearFilter={() => {
                                    setAddressLookup('');
                                    navigateToSearch({ page: 1, ip: null, status: null });
                                }}
                                description='Nothing is refused at sign-in. Ban an address to stop every sign-in attempt from it without touching a single account.'
                                action={<CreateIpBanButton />}
                            />
                        }
                    />
                    <DataTablePagination
                        table={table}
                        total={bans.meta.pagination.total}
                        count={bans.meta.pagination.count}
                        itemLabel='bans'
                    />
                </>
            ) : (
                <Spinner size='large' centered />
            )}
        </AdminContentBlock>
    );
}
