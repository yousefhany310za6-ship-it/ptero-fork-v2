import { useStore } from '@tanstack/react-form';
import type { AdminUser } from '@/api/admin/users/queries';
import {
    suspendFormDefaults,
    suspendToRequestBody,
    suspensionReasons,
    useSuspendUser,
} from '@/api/admin/users/suspensions';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { Form, useAppForm } from '@/components/form';

interface Props {
    user: AdminUser;
    open: boolean;
    onClose: () => void;
}

// Server-side validation is the authority; these mirror it for immediate feedback.
const validateMessage = (value: string): string | undefined => {
    const message = value.trim();

    if (!message) {
        return 'Say what the account is told; an account locked out with no explanation is a support request nobody can answer.';
    }

    if (message.length < 10) {
        return 'At least 10 characters.';
    }

    return message.length > 5000 ? 'At most 5,000 characters.' : undefined;
};

const validateNote =
    (isAdministrator: boolean) =>
    (value: string): string | undefined => {
        if (isAdministrator && value.trim() === '') {
            return 'Suspending an administrator requires an internal note explaining it.';
        }

        return value.length > 5000 ? 'At most 5,000 characters.' : undefined;
    };

const validateExpiry = (value: string): string | undefined => {
    if (!value) {
        return 'A dated suspension needs the moment it is meant to end.';
    }

    return new Date(value).getTime() > Date.now() ? undefined : 'Pick a moment in the future.';
};

const durationOptions = [
    { value: 'permanent', label: 'Permanent — until an administrator lifts it' },
    { value: 'temporary', label: 'Temporary — an administrator lifts it once the date passes' },
];

export default function SuspendUserDialog({ user, open, onClose }: Props) {
    const { attributes } = user;
    const isAdministrator = attributes.root_admin;
    const suspend = useSuspendUser(attributes.id);
    const form = useAppForm({
        defaultValues: suspendFormDefaults,
        onSubmit: async ({ value }) => {
            try {
                await suspend.mutateAsync(suspendToRequestBody(value));
                onClose();
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
    const duration = useStore(form.store, (state) => state.values.duration);

    return (
        <Dialog
            open={open}
            title={`Suspend ${attributes.email}`}
            preventExternalClose={isSubmitting}
            hideCloseIcon={isSubmitting}
            onClose={onClose}
        >
            <SpinnerOverlay visible={isSubmitting} />
            <p className='mb-6 text-sm leading-relaxed text-muted-foreground'>
                Closing the account stops every server it owns and refuses the next sign-in. Nothing is deleted: the
                servers, their files and the account itself stay exactly as they are until this is lifted.
            </p>
            <Form form={form} className='m-0'>
                <div className='grid gap-4'>
                    <form.AppField name='reason'>
                        {(field) => (
                            <field.SelectField
                                label='Reason'
                                description='One of a fixed list, so every closure can be counted and compared with the ones before it.'
                                options={suspensionReasons.map(({ value, label }) => ({ value, label }))}
                            />
                        )}
                    </form.AppField>
                    <form.AppField name='message' validators={{ onChange: ({ value }) => validateMessage(value) }}>
                        {(field) => (
                            <field.TextAreaField
                                label='Message to the account'
                                rows={4}
                                description='The only text the person on this account will read, next to their support case reference. Anything that belongs to the investigation goes in the internal note instead.'
                            />
                        )}
                    </form.AppField>
                    <form.AppField
                        name='internalNote'
                        validators={{ onChange: ({ value }) => validateNote(isAdministrator)(value) }}
                    >
                        {(field) => (
                            <field.TextAreaField
                                label='Internal note'
                                rows={3}
                                description='For administrators only, on the suspension record. Never shown to the account.'
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
                                    label='Ends at'
                                    type='datetime-local'
                                    description='The date is recorded so whoever reads the case later knows what was intended. Passing it does not reopen the account by itself — lifting stays a decision somebody makes.'
                                />
                            )}
                        </form.AppField>
                    )}
                    {isAdministrator && (
                        <>
                            <p className='text-xs text-warning'>
                                Closing an administrator hides nothing from the other administrators, and if this is the
                                only active one, nobody is left who can lift it.
                            </p>
                            <form.AppField name='acknowledgeLockout'>
                                {(field) => (
                                    <field.SwitchField
                                        label='I understand who is left able to lift this'
                                        description='Required when this account is the only active administrator.'
                                    />
                                )}
                            </form.AppField>
                        </>
                    )}
                    <p className='text-xs text-muted-foreground'>
                        A support case reference is generated when the suspension is recorded, and it is what the
                        account is told to quote.
                    </p>
                </div>
                <div className='mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                    <Button.Text type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button.Text>
                    <form.AppForm>
                        <form.SubmitButton color='red'>Suspend account</form.SubmitButton>
                    </form.AppForm>
                </div>
            </Form>
        </Dialog>
    );
}
