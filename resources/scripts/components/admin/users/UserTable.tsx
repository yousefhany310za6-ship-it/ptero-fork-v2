import { useState } from 'react';
import { useStore } from '@tanstack/react-form';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from '@tanstack/react-router';
import { LockOpen, Star, UserCheck, UserLock, UserX } from 'lucide-react';
import { deleteAdminUserInput, type AdminUser, useDeleteAdminUser } from '@/api/admin/users/queries';
import { accountFieldsOf } from '@/api/admin/users/types';
import { useUnsuspendUser } from '@/api/admin/users/suspensions';
import Badge from '@/components/elements/Badge';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import Icon from '@/components/elements/Icon';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import DataTableColumnHeader from '@/components/elements/table/DataTableColumnHeader';
import {
    actionsColumn,
    DeleteAction,
    EditLinkAction,
    RowActionButton,
    RowActions,
} from '@/components/elements/table/RowActions';
import { Form, useAppForm } from '@/components/form';
import SuspendUserDialog from '@/components/admin/users/SuspendUserDialog';
import { cn } from '@/lib/cn';
import dayjs from '@/lib/dayjs';

interface UserDialogProps {
    user: AdminUser;
    open: boolean;
    onClose: () => void;
}

function DeleteUserDialog({ user, open, onClose }: UserDialogProps) {
    const { attributes } = user;
    const deleteUser = useDeleteAdminUser();
    const form = useAppForm({
        defaultValues: { confirm: '' },
        onSubmit: async () => {
            if (attributes.id === undefined || attributes.servers_count > 0) {
                return;
            }

            try {
                await deleteUser.mutateAsync(deleteAdminUserInput(attributes.id, attributes.email));
                onClose();
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

    return (
        <Dialog
            open={open}
            title='Confirm user deletion'
            preventExternalClose={isSubmitting}
            hideCloseIcon={isSubmitting}
            onClose={onClose}
        >
            <SpinnerOverlay visible={isSubmitting} />
            <p className='text-sm'>
                Deleting a user is permanent. This will permanently delete <strong>{attributes.email}</strong> and all
                associated data.
            </p>
            <Form form={form} className='m-0 mt-6'>
                <form.AppField
                    name='confirm'
                    validators={{
                        onChange: ({ value }) =>
                            value === attributes.email ? undefined : 'The email address must be provided.',
                    }}
                >
                    {(field) => (
                        <field.TextField
                            type='text'
                            id={`confirm_${attributes.uuid}`}
                            label='Confirm email address'
                            description='Enter the email address to confirm deletion.'
                        />
                    )}
                </form.AppField>
                <div className='mt-6 flex justify-end gap-2'>
                    <Button.Text type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button.Text>
                    <form.AppForm>
                        <form.SubmitButton color='red'>Delete user</form.SubmitButton>
                    </form.AppForm>
                </div>
            </Form>
        </Dialog>
    );
}

const UserIdentityCell = ({ user }: { user: AdminUser }) => {
    const { attributes } = user;
    const name = [attributes.first_name, attributes.last_name].filter(Boolean).join(' ') || attributes.username;

    return (
        <div className='flex w-0 min-w-full items-center gap-3'>
            <img
                className='hidden h-9 w-9 shrink-0 rounded-full border border-border bg-background sm:block'
                src={`${attributes.image}?s=100`}
                alt={`${attributes.email} avatar`}
            />
            <div className='min-w-0'>
                {attributes.id === undefined ? (
                    <span className='block truncate font-medium' title={name}>
                        {name}
                    </span>
                ) : (
                    <Link
                        to='/panel/users/$id'
                        params={{ id: attributes.id }}
                        className='flex items-center gap-1.5 truncate font-medium text-foreground no-underline hover:text-accent'
                    >
                        <span className='truncate' title={name}>
                            {name}
                        </span>
                        {attributes.root_admin ? (
                            <Icon
                                icon={Star}
                                aria-label='Root administrator'
                                className='h-3.5 w-3.5 shrink-0 text-warning'
                            />
                        ) : null}
                    </Link>
                )}
                <p className='mt-0.5 truncate text-xs text-muted-foreground' title={attributes.email}>
                    {attributes.email}
                </p>
            </div>
        </div>
    );
};

/**
 * Lifting is a confirmation rather than a form: the decision is already on the record, and what an
 * administrator needs to read before making it is that nothing is started on the account's behalf.
 */
const UnsuspendUserAction = ({ user }: { user: AdminUser }) => {
    const { id, email } = user.attributes;
    const unsuspend = useUnsuspendUser(id);

    return (
        <Dialog.ConfirmTrigger
            title='Lift this suspension'
            confirm='Lift suspension'
            onConfirmed={async (_event, close) => {
                try {
                    await unsuspend.mutateAsync();
                    close();
                } catch {
                    // Error toast is handled by the mutation.
                }
            }}
            trigger={({ onClick }) => (
                <RowActionButton
                    icon={UserCheck}
                    label='Lift suspension'
                    aria-label={`Lift the suspension on ${email}`}
                    onClick={onClick}
                />
            )}
        >
            <p className='text-sm leading-relaxed text-muted-foreground'>
                <span className='font-medium text-foreground'>{email}</span> may sign in again as soon as this is
                confirmed. The servers it owns are not started: they were stopped when the account was closed, and each
                one comes back only when somebody starts it on purpose. The suspension record, its message and its
                support case reference are kept.
            </p>
        </Dialog.ConfirmTrigger>
    );
};

const SuspendUserAction = ({ user }: { user: AdminUser }) => {
    const [open, setOpen] = useState(false);
    const { email } = user.attributes;

    return (
        <>
            <RowActionButton
                icon={UserX}
                label='Suspend account'
                aria-label={`Suspend ${email}`}
                onClick={() => setOpen(true)}
            />
            {open && <SuspendUserDialog user={user} open onClose={() => setOpen(false)} />}
        </>
    );
};

const UserAccountStateCell = ({ user }: { user: AdminUser }) => {
    const account = accountFieldsOf(user.attributes);
    const suspended = account.status === 'suspended';

    return (
        <div className='flex flex-col items-start gap-1'>
            <Badge tone={suspended ? 'danger' : 'success'} size='sm' variant='soft'>
                {suspended ? 'Suspended' : 'Active'}
            </Badge>
            {account.supportCaseId && (
                <span className='font-mono text-xs text-muted-foreground' title='Support case reference'>
                    {account.supportCaseId}
                </span>
            )}
        </div>
    );
};

const UserActionsCell = ({ user }: { user: AdminUser }) => {
    const { id, email } = user.attributes;
    const suspended = accountFieldsOf(user.attributes).status === 'suspended';

    return (
        <RowActions>
            <EditLinkAction aria-label={`Edit ${email}`} to='/panel/users/$id' params={{ id }} />
            {suspended ? <UnsuspendUserAction user={user} /> : <SuspendUserAction user={user} />}
            <Dialog.Trigger
                trigger={({ onClick }) => (
                    <DeleteAction
                        aria-label={`Delete ${email}`}
                        disabled={user.attributes.servers_count > 0}
                        disabledReason='Users who own servers cannot be deleted.'
                        onClick={onClick}
                    />
                )}
            >
                {({ open, onClose }) => <DeleteUserDialog user={user} open={open} onClose={onClose} />}
            </Dialog.Trigger>
        </RowActions>
    );
};

export const userColumns = [
    {
        id: 'email',
        accessorFn: (user) => user.attributes.email,
        header: ({ column }) => <DataTableColumnHeader column={column} title='User' />,
        cell: ({ row }) => <UserIdentityCell user={row.original} />,
        enableSorting: true,
        meta: { headerClassName: 'min-w-52', cellClassName: 'min-w-52' },
    },
    {
        id: 'username',
        accessorFn: (user) => user.attributes.username,
        header: ({ column }) => <DataTableColumnHeader column={column} title='Username' />,
        cell: ({ row }) => (
            <span className='block w-0 min-w-full truncate font-mono text-xs' title={row.original.attributes.username}>
                {row.original.attributes.username}
            </span>
        ),
        enableSorting: true,
        meta: { headerClassName: 'hidden w-36 @xl:table-cell', cellClassName: 'hidden w-36 @xl:table-cell' },
    },
    {
        id: 'account_status',
        accessorFn: (user) => accountFieldsOf(user.attributes).status,
        header: 'State',
        cell: ({ row }) => <UserAccountStateCell user={row.original} />,
        enableSorting: false,
        meta: { headerClassName: 'hidden w-28 @md:table-cell', cellClassName: 'hidden w-28 @md:table-cell' },
    },
    {
        id: 'security',
        header: 'Security',
        cell: ({ row }) => {
            const enabled = row.original.attributes['2fa'];

            return (
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 text-xs',
                        enabled ? 'text-success' : 'text-destructive'
                    )}
                >
                    <Icon icon={enabled ? UserLock : LockOpen} aria-hidden='true' className='h-3.5 w-3.5' />
                    {enabled ? '2FA on' : '2FA off'}
                </span>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-24 @2xl:table-cell', cellClassName: 'hidden w-24 @2xl:table-cell' },
    },
    {
        id: 'servers_count',
        header: 'Servers',
        cell: ({ row }) => {
            const { id, servers_count } = row.original.attributes;

            return id === undefined ? (
                <span className='tabular-nums'>{servers_count}</span>
            ) : (
                <Link
                    to='/panel/servers'
                    search={{ filter: `owner_id:${id}` }}
                    className='tabular-nums text-accent hover:text-accent/80'
                >
                    {servers_count}
                </Link>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-20 @md:table-cell', cellClassName: 'hidden w-20 @md:table-cell' },
    },
    {
        id: 'last_login_at',
        accessorFn: (user) => accountFieldsOf(user.attributes).lastLoginAt,
        header: 'Last sign-in',
        cell: ({ row }) => {
            const at = accountFieldsOf(row.original.attributes).lastLoginAt;

            return at ? (
                <time className='whitespace-nowrap text-xs text-muted-foreground' dateTime={at}>
                    {dayjs(at).format('MMM D, YYYY')}
                </time>
            ) : (
                <span className='text-xs text-muted-foreground'>never</span>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-32 @3xl:table-cell', cellClassName: 'hidden w-32 @3xl:table-cell' },
    },
    {
        // Empty for anybody the panel has not answered for: the address is read out of sign-in
        // history and is sent only to a root administrator, so nothing here decides that.
        id: 'last_ip',
        accessorFn: (user) => accountFieldsOf(user.attributes).lastIp,
        header: 'Last address',
        cell: ({ row }) => {
            const ip = accountFieldsOf(row.original.attributes).lastIp;

            return ip ? (
                <span className='block truncate font-mono text-xs text-muted-foreground' title={ip}>
                    {ip}
                </span>
            ) : (
                <span className='text-xs text-muted-foreground'>—</span>
            );
        },
        enableSorting: false,
        meta: { headerClassName: 'hidden w-40 @3xl:table-cell', cellClassName: 'hidden w-40 @3xl:table-cell' },
    },
    {
        id: 'created_at',
        accessorFn: (user) => user.attributes.created_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title='Created' />,
        cell: ({ row }) => (
            <time
                className='whitespace-nowrap text-xs text-muted-foreground'
                dateTime={row.original.attributes.created_at}
            >
                {dayjs(row.original.attributes.created_at).format('MMM D, YYYY')}
            </time>
        ),
        enableSorting: true,
        sortDescFirst: true,
        meta: { headerClassName: 'hidden w-28 @3xl:table-cell', cellClassName: 'hidden w-28 @3xl:table-cell' },
    },
    actionsColumn<AdminUser>(2, (user) => <UserActionsCell user={user} />),
] satisfies ColumnDef<AdminUser>[];
