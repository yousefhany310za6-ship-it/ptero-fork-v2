import { useStore } from '@tanstack/react-form';
import { useUpdateSuspensionMessage, type UserSuspensionAttributes } from '@/api/admin/users/suspensions';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { Form, useAppForm } from '@/components/form';

interface Props {
    suspension: UserSuspensionAttributes;
    open: boolean;
    onClose: () => void;
}

// The same bounds the suspension itself is issued under, mirrored for immediate feedback.
const validateMessage = (value: string): string | undefined => {
    const message = value.trim();

    if (!message) {
        return 'The account is being told something; it cannot be left blank.';
    }

    if (message.length < 10) {
        return 'At least 10 characters.';
    }

    return message.length > 5000 ? 'At most 5,000 characters.' : undefined;
};

export default function EditSuspensionMessageDialog({ suspension, open, onClose }: Props) {
    const update = useUpdateSuspensionMessage(suspension.user_id);
    const form = useAppForm({
        defaultValues: { message: suspension.message ?? '' },
        onSubmit: async ({ value }) => {
            try {
                await update.mutateAsync(value.message.trim());
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
            title='Correct the message'
            preventExternalClose={isSubmitting}
            hideCloseIcon={isSubmitting}
            onClose={onClose}
        >
            <SpinnerOverlay visible={isSubmitting} />
            <p className='mb-6 text-sm leading-relaxed text-muted-foreground'>
                The account reads this as the current message for support case{' '}
                <span className='font-mono text-foreground'>{suspension.support_case_id}</span>. What was originally
                issued stays on the record untouched — a correction is added as a new version, so anybody reading the
                case later can see what was said and when.
            </p>
            <Form form={form} className='m-0'>
                <form.AppField name='message' validators={{ onChange: ({ value }) => validateMessage(value) }}>
                    {(field) => (
                        <field.TextAreaField
                            label='Message the account is shown'
                            rows={5}
                            description='Free text, never including anything about the investigation: this is read by the account holder.'
                        />
                    )}
                </form.AppField>
                <div className='mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                    <Button.Text type='button' isSecondary onClick={onClose}>
                        Cancel
                    </Button.Text>
                    <form.AppForm>
                        <form.SubmitButton>Save new version</form.SubmitButton>
                    </form.AppForm>
                </div>
            </Form>
        </Dialog>
    );
}
