import { useStore } from '@tanstack/react-form';
import { ipBanFormDefaults, ipBanToRequestBody, rangeStats, useCreateIpBan } from '@/api/admin/ipBans/queries';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { Form, useAppForm } from '@/components/form';

interface Props {
    open: boolean;
    onClose: () => void;
}

// Server-side validation is the authority; these mirror it for immediate feedback.
const validateIp = (value: string): string | undefined => {
    const ip = value.trim();

    if (!ip) {
        return 'An address or CIDR range is required.';
    }

    if (ip.length > 96) {
        return 'At most 96 characters.';
    }

    return rangeStats(ip).hosts === null ? 'The CIDR prefix is not a valid size for that address family.' : undefined;
};

const validateReason = (value: string): string | undefined => {
    const reason = value.trim();

    if (!reason) {
        return 'Say why the address is being banned; the reason is what whoever lifts it later reads.';
    }

    if (reason.length < 3) {
        return 'At least 3 characters.';
    }

    return reason.length > 500 ? 'At most 500 characters.' : undefined;
};

const validateExpiry = (value: string): string | undefined => {
    if (!value) {
        return 'A temporary ban needs the moment it stops applying.';
    }

    return new Date(value).getTime() > Date.now() ? undefined : 'Pick a moment in the future.';
};

const durationOptions = [
    { value: 'permanent', label: 'Permanent — until an administrator lifts it' },
    { value: 'temporary', label: 'Temporary — stops applying at a moment you set' },
];

const hostLabel = (hosts: bigint): string => (hosts === 1n ? 'one host' : `${hosts.toLocaleString('en-US')} hosts`);

export default function CreateIpBanDialog({ open, onClose }: Props) {
    const create = useCreateIpBan();
    const form = useAppForm({
        defaultValues: ipBanFormDefaults,
        onSubmit: async ({ value }) => {
            try {
                await create.mutateAsync(ipBanToRequestBody(value));
                onClose();
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
    const ip = useStore(form.store, (state) => state.values.ip);
    const duration = useStore(form.store, (state) => state.values.duration);
    const stats = rangeStats(ip);

    return (
        <Dialog
            open={open}
            title='Ban a network address'
            preventExternalClose={isSubmitting}
            hideCloseIcon={isSubmitting}
            onClose={onClose}
        >
            <SpinnerOverlay visible={isSubmitting} />
            <Form form={form} className='m-0'>
                <div className='grid gap-4'>
                    <form.AppField name='ip' validators={{ onChange: ({ value }) => validateIp(value) }}>
                        {(field) => (
                            <field.TextField
                                label='Address or CIDR range'
                                description='A bare address bans that host in either notation: 203.0.113.7, its IPv4-mapped IPv6 spellings, and the same address written as hexadecimal groups are one ban, not four. A range such as 198.51.100.0/24 bans every host inside it.'
                                autoComplete='off'
                            />
                        )}
                    </form.AppField>
                    <p className='text-xs text-muted-foreground' aria-live='polite'>
                        {stats.hosts === null
                            ? 'Nothing to size yet — the range is counted as soon as you type it.'
                            : `This covers ${hostLabel(stats.hosts)}, and refusing it locks nobody out of their data or their servers.`}
                    </p>
                    <form.AppField name='reason' validators={{ onChange: ({ value }) => validateReason(value) }}>
                        {(field) => (
                            <field.TextAreaField
                                label='Reason'
                                description='Kept on the ban record for administrators. The person on the other end of the address is never shown it.'
                                rows={3}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name='duration'>
                        {(field) => <field.SelectField label='Length' options={durationOptions} />}
                    </form.AppField>
                    {duration === 'temporary' && (
                        <form.AppField name='expiresAt' validators={{ onChange: ({ value }) => validateExpiry(value) }}>
                            {(field) => (
                                <field.TextField
                                    label='Expires at'
                                    type='datetime-local'
                                    description='After that moment the address may sign in again without anyone lifting the ban.'
                                />
                            )}
                        </form.AppField>
                    )}
                    {stats.isBroad && (
                        <>
                            <p className='text-xs text-warning'>
                                This range is wide enough to catch accounts that have nothing to do with the abuse, so
                                the panel refuses it unless you confirm you mean it.
                            </p>
                            <form.AppField name='acknowledgeBroad'>
                                {(field) => (
                                    <field.SwitchField
                                        label='I understand this bans every address in the range'
                                        description='Anything wider than a /112 in the normalised space — a /16 or wider for IPv4 — needs this confirmation.'
                                    />
                                )}
                            </form.AppField>
                        </>
                    )}
                    <p className='text-xs text-muted-foreground'>
                        Banning an address never suspends the accounts behind it, and the loopback address cannot be
                        banned at all: the panel's own health checks arrive from it.
                    </p>
                </div>
                <div className='mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                    <Button.Text type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button.Text>
                    <form.AppForm>
                        <form.SubmitButton>Ban address</form.SubmitButton>
                    </form.AppForm>
                </div>
            </Form>
        </Dialog>
    );
}
