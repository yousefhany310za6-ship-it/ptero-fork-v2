import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type OnChangeFn,
    type PaginationState,
} from '@tanstack/react-table';
import { ShieldCheck } from 'lucide-react';
import { accountFieldsOf } from '@/api/admin/users/types';
import {
    outcomeMeta,
    useAdminUserIpHistory,
    type AdminLoginEventListParams,
    type LoginEventItem,
    type LoginEventOutcome,
} from '@/api/admin/loginEvents/queries';
import { httpErrorToHuman } from '@/api/http';
import { useCurrentResource } from '@/extensions/resourceContext';
import Badge from '@/components/elements/Badge';
import DataTable from '@/components/elements/table/DataTable';
import DataTablePagination from '@/components/elements/table/DataTablePagination';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import Icon from '@/components/elements/Icon';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import TitledGreyBox from '@/components/elements/TitledGreyBox';

const emptyEvents: LoginEventItem[] = [];
const pageSize = 20;

const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** The refusals that are not this account's fault, and the ones that are. */
const outcomeOptions: readonly { value: LoginEventOutcome | ''; label: string }[] = [
    { value: '', label: 'Every attempt' },
    { value: 'failed', label: 'Failed credentials' },
    { value: 'suspended', label: 'Refused while suspended' },
    { value: 'banned', label: 'Refused by an address ban' },
    { value: 'throttled', label: 'Rate limited' },
    { value: 'checkpoint', label: 'Second factor asked for' },
    { value: 'success', label: 'Signed in' },
];

const Summary = ({
    twoFactor,
    lastLoginAt,
    status,
}: {
    twoFactor: boolean;
    lastLoginAt: string | null;
    status: string;
}) => (
    <dl className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
        <div>
            <dt className='text-xs text-muted-foreground'>Two-factor</dt>
            <dd className='mt-1 flex items-center gap-1.5 text-sm'>
                <Icon
                    icon={ShieldCheck}
                    aria-hidden='true'
                    className={twoFactor ? 'h-4 w-4 text-success' : 'h-4 w-4 text-destructive'}
                />
                {twoFactor ? 'Enabled' : 'Not enabled'}
            </dd>
        </div>
        <div>
            <dt className='text-xs text-muted-foreground'>Last sign-in</dt>
            <dd className='mt-1 font-mono text-sm'>{fmt(lastLoginAt)}</dd>
        </div>
        <div>
            <dt className='text-xs text-muted-foreground'>Account state</dt>
            <dd className='mt-1'>
                <Badge tone={status === 'suspended' ? 'danger' : 'success'} size='sm' variant='soft'>
                    {status === 'suspended' ? 'Suspended' : 'Active'}
                </Badge>
            </dd>
        </div>
    </dl>
);

const RefusalCell = ({ event }: { event: LoginEventItem }) => {
    const { ip_ban_id: banId, suspension_case_id: caseId } = event.attributes;

    if (caseId) {
        return (
            <span className='font-mono text-xs text-muted-foreground' title='Refused by this suspension'>
                case {caseId}
            </span>
        );
    }

    if (banId !== null) {
        return (
            <span className='font-mono text-xs text-muted-foreground' title='Refused by address ban record'>
                ban #{banId}
            </span>
        );
    }

    return <span className='text-xs text-muted-foreground'>—</span>;
};

const securityColumns = [
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
        id: 'refusal',
        accessorFn: (event: LoginEventItem) => event.attributes.suspension_case_id,
        header: 'Refused by',
        cell: ({ row }) => <RefusalCell event={row.original} />,
        enableSorting: false,
        meta: { headerClassName: 'hidden w-32 @md:table-cell', cellClassName: 'hidden w-32 @md:table-cell' },
    },
    {
        id: 'ip',
        accessorFn: (event: LoginEventItem) => event.attributes.ip,
        header: 'Address',
        cell: ({ row }) => (
            <span
                className='block truncate font-mono text-xs text-muted-foreground'
                title={row.original.attributes.ip ?? undefined}
            >
                {row.original.attributes.ip ?? 'no address recorded'}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'hidden w-40 @xl:table-cell', cellClassName: 'hidden w-40 @xl:table-cell' },
    },
    {
        id: 'user_agent',
        accessorFn: (event: LoginEventItem) => event.attributes.user_agent,
        header: 'Client',
        cell: ({ row }) => (
            <span
                className='block truncate text-xs text-muted-foreground'
                title={row.original.attributes.user_agent ?? undefined}
            >
                {row.original.attributes.user_agent ?? '—'}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
    },
    {
        id: 'created_at',
        accessorFn: (event: LoginEventItem) => event.attributes.created_at,
        header: 'When',
        cell: ({ row }) => (
            <span className='whitespace-nowrap font-mono text-xs text-muted-foreground'>
                {fmt(row.original.attributes.created_at)}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'hidden w-44 @lg:table-cell', cellClassName: 'hidden w-44 @lg:table-cell' },
    },
] satisfies ColumnDef<LoginEventItem>[];

export default function SecurityActivityTab() {
    const resource = useCurrentResource();

    if (resource?.kind !== 'admin.user') {
        throw new Error('A security activity tab was rendered without its user.');
    }

    const userId = resource.resource.attributes.id;
    const account = accountFieldsOf(resource.resource.attributes);
    const [page, setPage] = useState(1);
    const [outcome, setOutcome] = useState<LoginEventOutcome | ''>('');
    const params = useMemo<AdminLoginEventListParams>(
        () => ({ page, perPage: pageSize, outcome: outcome || undefined, sort: '-created_at' }),
        [outcome, page]
    );
    const {
        data: events,
        error,
        isFetching,
        refetch,
    } = useAdminUserIpHistory(userId, params, { placeholderData: keepPreviousData });
    const metadata = events?.meta.pagination;
    const pagination = useMemo<PaginationState>(
        () => ({ pageIndex: page - 1, pageSize }),
        // The size is this screen's own choice, so only the page number can come from the server.
        [page]
    );
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
        data: events?.data ?? emptyEvents,
        columns: securityColumns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (event) => String(event.attributes.id),
        manualPagination: true,
        rowCount: metadata?.total ?? 0,
        state: { pagination },
        onPaginationChange,
    });

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    return (
        <div className='grid gap-6'>
            <TitledGreyBox title='Authentication posture'>
                <Summary
                    twoFactor={resource.resource.attributes['2fa']}
                    lastLoginAt={account.lastLoginAt}
                    status={account.status}
                />
                <p className='mt-4 text-xs leading-relaxed text-muted-foreground'>
                    Nothing on this screen is edited here: two-factor is changed by the account holder, or disabled on
                    the account's own page by an administrator who has reason to.
                </p>
            </TitledGreyBox>
            <TitledGreyBox title='Sign-in activity'>
                <div className='mb-3'>
                    <select
                        aria-label='Filter attempts by result'
                        className='h-9 w-56 rounded-lg border border-border bg-card px-2 text-sm text-foreground'
                        value={outcome}
                        onChange={(event) => {
                            setPage(1);
                            setOutcome(event.target.value as LoginEventOutcome | '');
                        }}
                    >
                        {outcomeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
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
                                            <ShieldCheck />
                                        </EmptyMedia>
                                        <EmptyTitle>No attempts to report</EmptyTitle>
                                        <EmptyDescription>
                                            Nothing has been tried against this account inside the retention window.
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
        </div>
    );
}
