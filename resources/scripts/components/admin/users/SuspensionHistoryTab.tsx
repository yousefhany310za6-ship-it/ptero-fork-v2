import { useMemo, useState } from 'react';
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { useAllAdminUsers } from '@/api/admin/users/queries';
import {
    serverSuspensionOutcomeMeta,
    suspensionReasonLabel,
    suspensionStatusMeta,
    useUserSuspensions,
    type ServerSuspensionOutcome,
    type SuspensionServer,
    type UserSuspensionAttributes,
    type UserSuspensionItem,
} from '@/api/admin/users/suspensions';
import { httpErrorToHuman } from '@/api/http';
import { useCurrentResource } from '@/extensions/resourceContext';
import Badge from '@/components/elements/Badge';
import EditSuspensionMessageDialog from '@/components/admin/users/EditSuspensionMessageDialog';
import DataTable from '@/components/elements/table/DataTable';
import { actionsColumn, RowActionButton, RowActions } from '@/components/elements/table/RowActions';
import { ServerError } from '@/components/elements/ScreenBlock';
import Spinner from '@/components/elements/Spinner';
import TitledGreyBox from '@/components/elements/TitledGreyBox';

const emptySuspensions: UserSuspensionItem[] = [];

const fmt = (value: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** When the record stopped deciding anything: closed by a person, dated, or never ending. */
const endsLabel = (suspension: UserSuspensionAttributes): string => {
    if (suspension.lifted_at) {
        return `lifted ${fmt(suspension.lifted_at)}`;
    }

    return suspension.is_permanent ? 'no end date' : fmt(suspension.expires_at);
};

/**
 * The administrator a decision belongs to, named from the accounts the panel already knows. The id
 * is what the record carries; the address is what makes it readable, and an id nobody can name is
 * still shown rather than dropped.
 */
const useAdministratorNames = () => {
    const { data: users } = useAllAdminUsers();

    return useMemo(() => {
        const names = new Map<number, string>();

        for (const user of users ?? []) {
            if (user.attributes.root_admin) {
                names.set(user.attributes.id, user.attributes.email);
            }
        }

        return names;
    }, [users]);
};

/** One server this suspension acted on, as the row that describes it reads. */
const ServerOutcome = ({ server }: { server: SuspensionServer }) => {
    const meta = serverSuspensionOutcomeMeta(server.outcome);

    return (
        <Badge tone={meta.tone} size='sm' variant='soft'>
            <span title={server.failure ? `${meta.label}: ${server.failure}` : meta.label}>{meta.label}</span>
        </Badge>
    );
};

const outcomeOrder: readonly ServerSuspensionOutcome[] = ['failed', 'deferred', 'suspended', 'released'];

const outcomeRank = (outcome: ServerSuspensionOutcome): number => {
    const index = outcomeOrder.indexOf(outcome);

    return index === -1 ? outcomeOrder.length : index;
};

/** The outcomes worth naming first, so a refusal is not buried among the servers that stopped. */
const sortedServers = (servers: SuspensionServer[]): SuspensionServer[] =>
    [...servers].sort((a, b) => outcomeRank(a.outcome) - outcomeRank(b.outcome));

const ServersCell = ({ suspension }: { suspension: UserSuspensionAttributes }) => (
    <div className='flex flex-wrap items-center gap-1.5'>
        {suspension.servers.length === 0 ? (
            <span className='text-xs text-muted-foreground'>owned no servers</span>
        ) : (
            sortedServers(suspension.servers)
                .slice(0, 4)
                .map((server) => <ServerOutcome key={server.server_uuid} server={server} />)
        )}
    </div>
);

const RecordedCell = ({ suspension, names }: { suspension: UserSuspensionAttributes; names: Map<number, string> }) => {
    const actor = suspension.created_by === null ? null : names.get(suspension.created_by);

    return (
        <div className='text-xs text-muted-foreground'>
            <span className='block whitespace-nowrap'>{fmt(suspension.created_at)}</span>
            <span className='block truncate' title={actor ?? undefined}>
                {actor ?? 'an account no longer here'}
            </span>
        </div>
    );
};

interface ActionProps {
    suspension: UserSuspensionItem;
}

const SuspensionActionsCell = ({ suspension }: ActionProps) => {
    const [open, setOpen] = useState(false);
    const { attributes } = suspension;

    if (attributes.status !== 'active') {
        return (
            <RowActions>
                <span className='text-xs text-muted-foreground'>closed</span>
            </RowActions>
        );
    }

    return (
        <RowActions>
            <RowActionButton
                icon={ScrollText}
                label='Correct the message'
                aria-label={`Correct the message for support case ${attributes.support_case_id}`}
                onClick={() => setOpen(true)}
            />
            {open && <EditSuspensionMessageDialog suspension={attributes} open onClose={() => setOpen(false)} />}
        </RowActions>
    );
};

const suspensionColumns = (names: Map<number, string>) =>
    [
        {
            id: 'support_case_id',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.support_case_id,
            header: 'Case',
            cell: ({ row }) => (
                <span className='font-mono text-xs text-foreground'>{row.original.attributes.support_case_id}</span>
            ),
            enableSorting: false,
            meta: { headerClassName: 'w-24', cellClassName: 'w-24' },
        },
        {
            id: 'status',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.status,
            header: 'State',
            cell: ({ row }) => {
                const meta = suspensionStatusMeta(row.original.attributes.status);

                return (
                    <Badge tone={meta.tone} size='sm' variant='soft'>
                        {meta.label}
                    </Badge>
                );
            },
            enableSorting: false,
            meta: { headerClassName: 'w-28', cellClassName: 'w-28' },
        },
        {
            id: 'reason',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.reason,
            header: 'Reason',
            cell: ({ row }) => (
                <span className='block truncate text-sm'>{suspensionReasonLabel(row.original.attributes.reason)}</span>
            ),
            enableSorting: false,
            meta: { headerClassName: 'w-40', cellClassName: 'w-40' },
        },
        {
            id: 'message',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.message,
            header: 'Message to the account',
            cell: ({ row }) => {
                const { message, internal_note: internalNote } = row.original.attributes;

                return (
                    <div className='min-w-0'>
                        <span className='block truncate text-sm text-muted-foreground' title={message ?? undefined}>
                            {message ?? '—'}
                        </span>
                        {internalNote && (
                            // The note is the reasoning behind the decision, and it is the one field
                            // on this screen that never reaches the account.
                            <span
                                className='block truncate text-xs text-muted-foreground italic'
                                title={`Internal note: ${internalNote}`}
                            >
                                note: {internalNote}
                            </span>
                        )}
                    </div>
                );
            },
            enableSorting: false,
            meta: { headerClassName: 'w-auto', cellClassName: 'w-auto' },
        },
        {
            id: 'servers',
            header: 'Servers',
            cell: ({ row }) => <ServersCell suspension={row.original.attributes} />,
            enableSorting: false,
            meta: { headerClassName: 'hidden w-56 @2xl:table-cell', cellClassName: 'hidden w-56 @2xl:table-cell' },
        },
        {
            id: 'ends',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.expires_at,
            header: 'Ends',
            cell: ({ row }) => (
                <span className='whitespace-nowrap font-mono text-xs text-muted-foreground'>
                    {endsLabel(row.original.attributes)}
                </span>
            ),
            enableSorting: false,
            meta: { headerClassName: 'hidden w-40 @xl:table-cell', cellClassName: 'hidden w-40 @xl:table-cell' },
        },
        {
            id: 'created_at',
            accessorFn: (suspension: UserSuspensionItem) => suspension.attributes.created_at,
            header: 'Recorded',
            cell: ({ row }) => <RecordedCell suspension={row.original.attributes} names={names} />,
            enableSorting: false,
            meta: { headerClassName: 'hidden w-44 @xl:table-cell', cellClassName: 'hidden w-44 @xl:table-cell' },
        },
        actionsColumn<UserSuspensionItem>(1, (suspension) => <SuspensionActionsCell suspension={suspension} />),
    ] satisfies ColumnDef<UserSuspensionItem>[];

export default function SuspensionHistoryTab() {
    const resource = useCurrentResource();

    if (resource?.kind !== 'admin.user') {
        throw new Error('A suspension tab was rendered without its user.');
    }

    const userId = resource.resource.attributes.id;
    const names = useAdministratorNames();
    const columns = useMemo(() => suspensionColumns(names), [names]);
    const { data: suspensions, error, isFetching, refetch } = useUserSuspensions(userId, { page: 1, perPage: 50 });
    const table = useReactTable({
        data: suspensions?.data ?? emptySuspensions,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (suspension) => String(suspension.attributes.id),
    });

    if (error) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    if (!suspensions) {
        return (
            <TitledGreyBox title='Suspension history'>
                <Spinner size='large' centered />
            </TitledGreyBox>
        );
    }

    return (
        <TitledGreyBox title='Suspension history'>
            <DataTable
                table={table}
                tableClassName='table-fixed'
                isFetching={isFetching}
                emptyState='Nothing has ever closed this account. A suspension records its reason, the message the account was given, and what happened to each server it owns.'
            />
            <p className='mt-3 text-xs leading-relaxed text-muted-foreground'>
                Lifted suspensions stay here: the record of a decision outlives the decision. The internal note and the
                administrators involved are read by anybody who can reach this screen, and never by the account itself.
            </p>
        </TitledGreyBox>
    );
}
