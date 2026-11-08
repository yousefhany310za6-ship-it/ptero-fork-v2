import { useStore } from '@tanstack/react-form';
import { cn } from '@/lib/cn';
import {
    useCreateAnnouncementTag,
    useUpdateAnnouncementTag,
    type AnnouncementTag,
    type AnnouncementTagFormValues,
} from '@/api/admin/announcements/tag-queries';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import { Form, useAppForm } from '@/components/form';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';

interface Props {
    open: boolean;
    onClose: () => void;
    tag?: AnnouncementTag;
}

const colorOptions = [
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#ef4444', label: 'Red' },
    { value: '#8b5cf6', label: 'Violet' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#6366f1', label: 'Indigo' },
];

const iconOptions = [
    { value: 'alert-triangle', label: 'Alert Triangle' },
    { value: 'bell', label: 'Bell' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'check-circle', label: 'Check Circle' },
    { value: 'clock', label: 'Clock' },
    { value: 'info', label: 'Info' },
    { value: 'mail', label: 'Mail' },
    { value: 'megaphone', label: 'Megaphone' },
    { value: 'shield-alert', label: 'Shield Alert' },
    { value: 'users', label: 'Users' },
    { value: 'wrench', label: 'Wrench' },
];

export default function AnnouncementTagFormDialog({ open, onClose, tag }: Props) {
    const create = useCreateAnnouncementTag();
    const update = useUpdateAnnouncementTag();
    const editing = !!tag;

    const form = useAppForm({
        defaultValues: {
            name: tag?.name ?? '',
            color: tag?.color ?? '#3b82f6',
            icon: tag?.icon ?? '',
        },
        validators: {
            onSubmit: ({ value }) => {
                if (!/^#[0-9a-fA-F]{3,8}$/.test(value.color)) {
                    return 'Colour must be a valid hex code (e.g. #3b82f6).';
                }
                return;
            },
        },
        onSubmit: async ({ value }) => {
            try {
                if (tag) {
                    await update.mutateAsync({ id: tag.id, body: value });
                } else {
                    await create.mutateAsync(value);
                }
                onClose();
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });

    const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

    return (
        <Dialog open={open} title={editing ? `Edit tag: ${tag.name}` : 'New tag'} onOpenChange={onClose}>
            <Form {...form}>
                <div className='grid gap-4 sm:grid-cols-2'>
                    <form.AppField name='name' validators={{ onChange: ({ value }) => validateName(value) }}>
                        {(field) => (
                            <field.TextField
                                label='Tag name'
                                description='Shown to users — keep it short, e.g. Maintenance, Events, Warning.'
                                autoComplete='off'
                            />
                        )}
                    </form.AppField>
                    <form.AppField name='color'>
                        {(field) => (
                            <div className='space-y-1.5'>
                                <label className='fs-micro font-medium uppercase tracking-[0.14em] text-ink-muted'>
                                    Accent colour
                                </label>
                                <div className='flex flex-wrap gap-2'>
                                    {colorOptions.map((option) => (
                                        <button
                                            key={option.value}
                                            type='button'
                                            onClick={() => {
                                                form.setFieldValue('color', option.value);
                                            }}
                                            className={cn(
                                                'size-6 rounded-full border',
                                                field.value.color === option.value
                                                    ? 'ring-1 ring-inset ring-foreground shadow-sm'
                                                    : 'border-transparent',
                                            )}
                                            style={{ backgroundColor: option.value }}
                                            title={option.label}
                                            aria-label={option.label}
                                        />
                                    ))}
                                    <button
                                        type='button'
                                        onClick={() => {
                                            form.setFieldValue('color', '#ffffff');
                                        }}
                                        className='size-6 rounded-full border border-transparent bg-white'
                                        title='White'
                                        aria-label='White'
                                    />
                                    <input
                                        {...field.getInputProps()}
                                        type='color'
                                        className='h-6 w-6 cursor-pointer border-none bg-transparent p-0'
                                        style={{ display: 'none' }}
                                    />
                                </div>
                                <p className='fs-tiny text-ink-muted'>
                                    Shown as the tag chip colour next to announcements.
                                </p>
                            </div>
                        )}
                    </form.AppField>
                    <form.AppField name='icon'>
                        {(field) => (
                            <field.SelectField label='Icon type' options={iconOptions} />
                        )}
                    </form.AppField>
                </div>
            </Form>
            <div className='mt-4 flex justify-end gap-2'>
                <Button type='button' variant='outline' onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type='submit' disabled={isSubmitting}>
                    {editing ? 'Save tag' : 'Create tag'}
                </Button>
            </div>
        </Dialog>
    );
}

function validateName(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return 'Tag name is required.';
    }
    if (trimmed.length > 60) {
        return 'At most 60 characters.';
    }
    return undefined;
}
