import type { ColumnDef } from '@tanstack/react-table';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { httpErrorToHuman } from '@/api/http';
import { useAddressAccounts, type AddressAccountRow } from '@/api/admin/loginEvents/queries';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import Badge from '@/components/elements/Badge';
import DataTable from '@/components/elements/table/DataTable';
import { Dialog } from '@/components/elements/dialog';

interface Props {
    open: boolean;
    onClose: () => void;
    ip: string;
}

const emptyAccounts: AddressAccountRow[] = [];

const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }) : '—';

const columns = [
    {
        id: 'account',
        header: 'Account',
        cell: ({ row }) => (
            <div className='min-w-0'>
                <p className='truncate text-sm text-foreground'>
                    {row.original.user_uuid ?? <span className='text-muted-foreground'>No account matched</span>}
                </p>
                <p className='mt-1 font-mono text-xs text-muted-foreground'>
                    tried as {row.original.username_attempted ?? '—'}
                </p>
            </div>
        ),
        enableSorting: false,
    },
    {
        id: 'attempts',
        header: 'Attempts',
        cell: ({ row }) => <span className='font-mono text-xs text-muted-foreground'>{row.original.attempts}</span>,
        enableSorting: false,
        meta: { headerClassName: 'w-24 text-right', cellClassName: 'w-24 text-right' },
    },
    {
        id: 'successes',
        header: 'Signed in',
        cell: ({ row }) =>
            row.original.successes > 0 ? (
                <Badge tone='success' size='sm' variant='soft'>
                    {row.original.successes}
                </Badge>
            ) : (
                <span className='text-xs text-muted-foreground'>never</span>
            ),
        enableSorting: false,
        meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
    },
    {
        id: 'last_seen',
        header: 'Last seen',
        cell: ({ row }) => (
            <span className='font-mono text-xs text-muted-foreground'>{fmt(row.original.last_seen)}</span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-36', cellClassName: 'w-36' },
    },
] satisfies ColumnDef<AddressAccountRow>[];

type AccountsQuery = ReturnType<typeof useAddressAccounts>;

interface BodyProps {
    ip: string;
    query: AccountsQuery;
}

const AccountsBody = ({ ip, query }: BodyProps) => {
    const { data, error, refetch } = query;
    const table = useReactTable({
        data: data?.accounts ?? emptyAccounts,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (account) => `${account.user_uuid ?? ''}|${account.username_attempted ?? ''}`,
    });

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    if (!data) {
        return <Spinner size='large' centered />;
    }

    return (
        <>
            <DataTable
                table={table}
                emptyState={
                    <Empty size='compact'>
                        <EmptyHeader>
                            <EmptyMedia variant='icon'>
                                <Users />
                            </EmptyMedia>
                            <EmptyTitle>Nothing recorded</EmptyTitle>
                            <EmptyDescription>No sign-in has ever been attempted from {ip}.</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                }
            />
            {data.truncated && (
                <p className='text-xs leading-relaxed text-muted-foreground'>
                    More accounts used this address than are shown here. The list stops at 50 because one host can be
                    the source of a name-enumeration run of thousands.
                </p>
            )}
        </>
    );
};

export default function AddressAccountsDialog({ open, onClose, ip }: Props) {
    const query = useAddressAccounts(ip);

    return (
        <Dialog open={open} onClose={onClose} title={`Accounts at ${ip}`}>
            <div className='space-y-3'>
                <p className='text-sm leading-relaxed text-muted-foreground'>
                    Everything this address has been used for, grouped by the account it was used for. A name that was
                    only typed and never matched belongs to no account, and says nothing about one.
                </p>
                <AccountsBody ip={ip} query={query} />
            </div>
        </Dialog>
    );
}
