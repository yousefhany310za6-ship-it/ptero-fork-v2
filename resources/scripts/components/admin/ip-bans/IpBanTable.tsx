import type { ColumnDef } from '@tanstack/react-table';
import { Unlink } from 'lucide-react';
import { useDeleteIpBan, type IpBanAttributes, type IpBanItem } from '@/api/admin/ipBans/queries';
import Badge from '@/components/elements/Badge';
import { Dialog } from '@/components/elements/dialog';
import DataTableColumnHeader from '@/components/elements/table/DataTableColumnHeader';
import { actionsColumn, RowActionButton, RowActions } from '@/components/elements/table/RowActions';
import type { UiTone } from '@/themes/skins';

const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }) : '—';

/** How a ban reads in the state column. */
interface BanStateMeta {
    label: string;
    tone: UiTone;
}

/** Whether a ban is refusing traffic now, and for how long — read off the same two columns the matcher uses. */
const banState = (ban: IpBanAttributes): BanStateMeta => {
    if (ban.expires_at && new Date(ban.expires_at).getTime() <= Date.now()) {
        return { label: 'Expired', tone: 'neutral' };
    }

    return ban.is_permanent ? { label: 'Permanent', tone: 'warning' } : { label: 'Active', tone: 'danger' };
};

interface Props {
    ban: IpBanItem;
}

const IpBanActionsCell = ({ ban }: Props) => {
    const { id, ip } = ban.attributes;
    const lift = useDeleteIpBan();

    return (
        <RowActions>
            <Dialog.ConfirmTrigger
                title='Lift this ban'
                confirm='Lift ban'
                onConfirmed={async (_event, close) => {
                    try {
                        await lift.mutateAsync(id);
                        close();
                    } catch {
                        // Error toast is handled by the mutation.
                    }
                }}
                trigger={({ onClick }) => (
                    <RowActionButton
                        icon={Unlink}
                        label='Lift ban'
                        aria-label={`Lift the ban on ${ip}`}
                        onClick={onClick}
                    />
                )}
            >
                <p className='text-sm leading-relaxed text-muted-foreground'>
                    Sign-in from <span className='font-mono text-foreground'>{ip}</span> stops being refused as soon as
                    the ban is deleted. Accounts created from it are untouched — a ban never disables an account, only
                    the address.
                </p>
            </Dialog.ConfirmTrigger>
        </RowActions>
    );
};

export const ipBanColumns = [
    {
        id: 'ip',
        accessorFn: (ban: IpBanItem) => ban.attributes.ip,
        header: 'Address',
        cell: ({ row }) => {
            const { ip, is_range: isRange } = row.original.attributes;

            return (
                <div className='flex min-w-0 items-center gap-2'>
                    <span className='truncate font-mono text-sm text-foreground' title={ip}>
                        {ip}
                    </span>
                    {isRange && (
                        <Badge tone='info' size='sm' variant='soft'>
                            range
                        </Badge>
                    )}
                </div>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'w-52', cellClassName: 'w-52' },
    },
    {
        id: 'reason',
        accessorFn: (ban: IpBanItem) => ban.attributes.reason,
        header: 'Reason',
        cell: ({ row }) => (
            <span className='block truncate text-sm text-muted-foreground' title={row.original.attributes.reason}>
                {row.original.attributes.reason}
            </span>
        ),
        enableSorting: false,
        meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
    },
    {
        id: 'state',
        accessorFn: (ban: IpBanItem) => ban.attributes.expires_at,
        header: 'State',
        cell: ({ row }) => {
            const state = banState(row.original.attributes);

            return (
                <Badge tone={state.tone} size='sm' variant='soft'>
                    {state.label}
                </Badge>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
    },
    {
        id: 'expires_at',
        accessorFn: (ban: IpBanItem) => ban.attributes.expires_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title='Expires' />,
        cell: ({ row }) => (
            <span className='font-mono text-xs text-muted-foreground'>{fmt(row.original.attributes.expires_at)}</span>
        ),
        enableSorting: true,
        meta: { headerClassName: 'hidden w-36 @xl:table-cell', cellClassName: 'hidden w-36 @xl:table-cell' },
    },
    {
        id: 'created_at',
        accessorFn: (ban: IpBanItem) => ban.attributes.created_at,
        header: 'Banned',
        cell: ({ row }) => (
            <span className='font-mono text-xs text-muted-foreground'>{fmt(row.original.attributes.created_at)}</span>
        ),
        enableSorting: true,
        meta: { headerClassName: 'hidden w-36 @xl:table-cell', cellClassName: 'hidden w-36 @xl:table-cell' },
    },
    actionsColumn<IpBanItem>(1, (ban) => <IpBanActionsCell ban={ban} />),
] satisfies ColumnDef<IpBanItem>[];
