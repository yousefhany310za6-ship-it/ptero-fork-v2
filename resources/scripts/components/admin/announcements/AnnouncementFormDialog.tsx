import { useStore } from '@tanstack/react-form';
import {
    announcementFormDefaults,
    announcementToRequestBody,
    useAdminAnnouncementTags,
    useCreateAnnouncement,
    useUpdateAnnouncement,
    type AnnouncementFormValues,
    type AnnouncementItem,
    type AnnouncementKind,
    type AnnouncementPolicy,
    type AnnouncementTag,
} from '@/api/admin/announcements/queries';
import AnnouncementBanner from '@/components/announcements/AnnouncementBanner';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import { Form, useAppForm } from '@/components/form';
import Markdown from '@/components/elements/Markdown';

interface Props {
    open: boolean;
    onClose: () => void;
    announcement?: AnnouncementItem;
}

const kindOptions = [
    { value: 'info', label: 'Information', tone: 'info' },
    { value: 'success', label: 'Success', tone: 'success' },
    { value: 'warning', label: 'Warning', tone: 'warning' },
    { value: 'critical', label: 'Critical', tone: 'danger' },
];

const policyOptions = [
    { value: 'once', label: 'Once — hides after dismiss or ack' },
    { value: 'every_visit', label: 'Every visit — reappears each visit' },
    { value: 'interval', label: 'Repeating interval (snooze-style)' },
    { value: 'until_ack', label: 'Until acknowledged — dismiss does not hide' },
];

const intervalOptions = [
    { value: '1', label: 'Every hour' },
    { value: '6', label: 'Every 6 hours' },
    { value: '24', label: 'Every day' },
    { value: '168', label: 'Every week' },
    { value: '720', label: 'Every 30 days' },
];

const audienceOptions = [
    { value: 'all', label: 'All users' },
    { value: 'users', label: 'Specific user IDs' },
];

const displayTypeOptions = [
    { value: 'banner', label: 'Dashboard banner' },
    { value: 'modal', label: 'Popup modal' },
];

// Server-side validation is the authority; these mirror it for immediate feedback.
const requiredWithMax =
    (requiredMessage: string, max: number, tooLongMessage: string) =>
    (value: string): string | undefined => {
        const trimmed = value.trim();

        if (!trimmed) {
            return requiredMessage;
        }

        return trimmed.length > max ? tooLongMessage : undefined;
    };

const validateName = requiredWithMax('Internal name is required.', 100, 'At most 100 characters.');
const validateTitle = requiredWithMax('Title is required.', 140, 'At most 140 characters.');
const validateBody = requiredWithMax('Body is required.', 4000, 'At most 4000 characters.');

const validateActionUrl = (value: string): string | undefined => {
    const url = value.trim();

    if (!url) {
        return undefined;
    }

    if (/[\s<>]/.test(url)) {
        return 'The URL cannot contain spaces or angle brackets.';
    }

    if (url.startsWith('//')) {
        return 'Protocol-relative URLs are not allowed.';
    }

    if (/^(javascript|data|vbscript|file):/i.test(url)) {
        return 'That URL scheme is blocked for safety.';
    }

    if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) {
        return 'Use a site-relative path or an http(s) URL.';
    }

    return undefined;
};

const toLocalInput = (iso?: string | null): string => {
    if (!iso) {
        return '';
    }

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);

const formValues = (announcement?: AnnouncementItem): AnnouncementFormValues => {
    const defaults = announcementFormDefaults(announcement?.attributes);

    return {
        ...defaults,
        eventStart: toLocalInput(defaults.eventStart),
        eventEnd: toLocalInput(defaults.eventEnd),
        publishAt: toLocalInput(defaults.publishAt),
        expiresAt: toLocalInput(defaults.expiresAt),
    };
};

export default function AnnouncementFormDialog({ open, onClose, announcement }: Props) {
    const create = useCreateAnnouncement();
    const update = useUpdateAnnouncement();
    const { data: tags } = useAdminAnnouncementTags();
    const editing = !!announcement;

    const form = useAppForm({
        defaultValues: formValues(announcement),
        validators: {
            onSubmit: ({ value }) => {
                if (value.eventStart && value.eventEnd && value.eventStart > value.eventEnd) {
                    return 'The event window start must come before its end.';
                }

                if (value.publishAt && value.expiresAt && value.publishAt > value.expiresAt) {
                    return 'The announcement would expire before it is published.';
                }

                return;
            },
        },
        onSubmit: async ({ value }) => {
            const body = announcementToRequestBody({
                ...value,
                eventStart: fromLocalInput(value.eventStart) ?? '',
                eventEnd: fromLocalInput(value.eventEnd) ?? '',
                publishAt: fromLocalInput(value.publishAt) ?? '',
                expiresAt: fromLocalInput(value.expiresAt) ?? '',
            });

            try {
                if (announcement) {
                    await update.mutateAsync({ id: announcement.attributes.id, body });
                } else {
                    await create.mutateAsync(body);
                }

                onClose();
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });
    const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
    const kind = useStore(form.store, (state) => state.values.kind);
    const displayType = useStore(form.store, (state) => state.values.displayType);
    const tagId = useStore(form.store, (state) => state.values.tagId);
    const title = useStore(form.store, (state) => state.values.title);
    const body = useStore(form.store, (state) => state.values.body);
    const policy = useStore(form.store, (state) => state.values.policy);
    const requireAck = useStore(form.store, (state) => state.values.requireAck);
    const actionLabel = useStore(form.store, (state) => state.values.actionLabel);
    const actionUrl = useStore(form.store, (state) => state.values.actionUrl);
    const eventStart = useStore(form.store, (state) => state.values.eventStart);
    const eventEnd = useStore(form.store, (state) => state.values.eventEnd);
    const publishAt = useStore(form.store, (state) => state.values.publishAt);
    const expiresAt = useStore(form.store, (state) => state.values.expiresAt);

    const tagOptions = (tags ?? []).map((tag: AnnouncementTag) => ({
        value: String(tag.id),
        label: tag.name,
    }));

    const tagChips = (tags ?? [])
        .filter((t: AnnouncementTag) => tagId ? String(t.id) === tagId : false)
        .map((t: AnnouncementTag) => t);

    return (
        <Dialog
            open={open}
            title={editing ? `Edit: ${announcement.attributes.name}` : 'New announcement'}
            preventExternalClose={isSubmitting}
            hideCloseIcon={isSubmitting}
            onClose={onClose}
            className='w-full max-w-[1000px]'
        >
            <SpinnerOverlay visible={isSubmitting} />
            <div className='max-h-[calc(100vh-4rem)] overflow-y-auto px-4 pb-6 pr-2'>
                <Form form={form} className='m-0 space-y-6'>
                    <div className='grid gap-6 lg:grid-cols-[1fr_360px]'>
                        {/* ---- Content ---- */}
                        <section className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <Megaphone className='size-5 text-muted-foreground' aria-hidden />
                                <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>Content</h2>
                            </div>
                            <form.AppField name='name' validators={{ onChange: ({ value }) => validateName(value) }}>
                                {(field) => (
                                    <field.TextField
                                        label='Internal name'
                                        description='Admin-only label. Renaming never re-shows the banner to anyone.'
                                        autoComplete='off'
                                        className='col-span-full'
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name='title' validators={{ onChange: ({ value }) => validateTitle(value) }}>
                                {(field) => (
                                    <field.TextField
                                        label='Title'
                                        description='The headline users see.'
                                        autoComplete='off'
                                        className='col-span-full'
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name='body' validators={{ onChange: ({ value }) => validateBody(value) }}>
                                {(field) => (
                                    <div className='space-y-2'>
                                        <label className='block text-sm font-medium text-foreground/90'>Body</label>
                                        <p className='text-xs text-muted-foreground'>
                                            Supports Markdown (headings, **bold**, *italic*, `code`, links, lists, quotes). Line breaks are preserved.
                                        </p>
                                        <field.TextAreaField
                                            label='Body'
                                            rows={8}
                                            className='col-span-full'
                                        />
                                    </div>
                                )}
                            </form.AppField>
                        </section>

                        {/* ---- Delivery ---- */}
                        <section className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>Delivery</h2>
                            </div>
                            <div className='grid gap-4 sm:grid-cols-2'>
                                <form.AppField name='kind'>
                                    {(field) => (
                                        <field.SelectField
                                            label='Kind'
                                            description='Icon and text label are always shown — colour alone never carries meaning.'
                                            options={kindOptions}
                                        />
                                    )}
                                </form.AppField>
                                <form.AppField name='displayType'>
                                    {(field) => (
                                        <field.SelectField
                                            label='Display as'
                                            description='Banner stays in the dashboard stack; modal opens as a popup users must close.'
                                            options={displayTypeOptions}
                                        />
                                    )}
                                </form.AppField>
                            </div>
                            <form.AppField name='tagId'>
                                {(field) => (
                                    <field.SelectField
                                        label='Tag'
                                        description='Optional badge colour and icon. Leave empty for the kind-based look.'
                                        options={tagOptions}
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name='policy'>
                                {(field) => <field.SelectField label='Display policy' options={policyOptions} />}
                            </form.AppField>
                            {policy === 'interval' && (
                                <form.AppField name='intervalHours'>
                                    {(field) => <field.SelectField label='Repeat every' options={intervalOptions} />}
                                </form.AppField>
                            )}
                            <form.AppField name='requireAck'>
                                {(field) => (
                                    <field.SwitchField
                                        label='Require explicit acknowledgement'
                                        description='While unacknowledged the banner cannot be dismissed and re-blocks dismissal-based hiding.'
                                    />
                                )}
                            </form.AppField>
                        </section>

                        {/* ---- Audience & Action ---- */}
                        <section className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>Audience &amp; action</h2>
                            </div>
                            <form.AppField name='audienceType'>
                                {(field) => (
                                    <field.SelectField
                                        label='Audience'
                                        description='Targets are enforced server-side; no emails or personal data are ever exposed to users.'
                                        options={audienceOptions}
                                    />
                                )}
                            </form.AppField>
                            <form.AppField name='audienceUserIds'>
                                {(field) => (
                                    <field.TextField
                                        label='User IDs'
                                        description='Comma-separated, e.g. 4, 17, 22. Required when the audience is specific users.'
                                        autoComplete='off'
                                    />
                                )}
                            </form.AppField>
                            <div className='grid gap-4 sm:grid-cols-2'>
                                <form.AppField name='actionLabel'>
                                    {(field) => <field.TextField label='Action label (optional)' autoComplete='off' />}
                                </form.AppField>
                                <form.AppField
                                    name='actionUrl'
                                    validators={{ onChange: ({ value }) => validateActionUrl(value) }}
                                >
                                    {(field) => (
                                        <field.TextField
                                            label='Action URL (optional)'
                                            description='Site path or http(s) only — javascript:, data:, and file: are blocked.'
                                            autoComplete='off'
                                        />
                                    )}
                                </form.AppField>
                            </div>
                        </section>

                        {/* ---- Timing ---- */}
                        <section className='space-y-4'>
                            <div className='flex items-center gap-2'>
                                <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>Timing</h2>
                            </div>
                            <div className='grid gap-4 sm:grid-cols-2'>
                                <form.AppField name='eventStart'>
                                    {(field) => <field.TextField label='Event window start' type='datetime-local' />}
                                </form.AppField>
                                <form.AppField name='eventEnd'>
                                    {(field) => <field.TextField label='Event window end' type='datetime-local' />}
                                </form.AppField>
                                <form.AppField name='publishAt'>
                                    {(field) => (
                                        <field.TextField
                                            label='Publish at (optional)'
                                            type='datetime-local'
                                            description='Empty: publish immediately on Publish.'
                                        />
                                    )}
                                </form.AppField>
                                <form.AppField name='expiresAt'>
                                    {(field) => <field.TextField label='Expires at (optional)' type='datetime-local' />}
                                </form.AppField>
                            </div>
                        </section>
                    </div>

                    {editing && (
                        <p className='text-xs text-muted-foreground'>
                            Editing title, body, kind, action, or the event window is a material change: the banner
                            version bumps and resurfaces to everyone under the same policy. Admin-only fields never
                            do.
                        </p>
                    )}

                    {/* ---- Live preview ---- */}
                    <section className='space-y-2 pt-2 border-t border-border/60'>
                        <div className='flex items-center gap-2'>
                            <h2 className='text-sm font-semibold uppercase tracking-wider text-muted-foreground'>Live preview</h2>
                        </div>
                        <div className='rounded-2xl border shadow-sm bg-card p-4'>
                            <AnnouncementBanner
                                preview
                                kind={(kind as AnnouncementKind) ?? 'info'}
                                tag={
                                    tagChips.length ? { name: tagChips[0].name, color: tagChips[0].color, icon: tagChips[0].icon } : null
                                }
                                title={title || 'Announcement title'}
                                body={body || 'The announcement body appears here, exactly as users will see it.'}
                                policy={policy as AnnouncementPolicy}
                                requireAck={requireAck}
                                actionLabel={actionLabel || null}
                                actionUrl={actionUrl || null}
                                eventStart={eventStart || null}
                                eventEnd={eventEnd || null}
                            />
                        </div>
                        <p className='text-xs text-muted-foreground'>
                            Rendered with the same component the user dashboard sees — Markdown included.
                        </p>
                    </section>

                    <div className='mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                        <Button.Text type='button' isSecondary onClick={onClose}>
                            Cancel
                        </Button.Text>
                        <form.AppForm>
                            <form.SubmitButton>{editing ? 'Save changes' : 'Save draft'}</form.SubmitButton>
                        </form.AppForm>
                    </div>
                </Form>
            </div>
        </Dialog>
    );
}
