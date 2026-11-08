import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, Input, Label, PageContentBlock, Select, Spinner, TitledGreyBox, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { deleteChannel, getChannels, keys, saveChannel, testChannel, type Channel, type ChannelInput, type ChannelType } from '../api';

interface Field {
    key: string;
    label: string;
    placeholder: string;
    optional?: boolean;
}

const TYPES: { value: ChannelType; label: string; fields: Field[]; help: string }[] = [
    { value: 'discord', label: 'Discord', help: 'Server Settings → Integrations → Webhooks → New Webhook → Copy URL.', fields: [{ key: 'url', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…' }] },
    {
        value: 'ntfy',
        label: 'ntfy',
        help: 'Subscribe to the same topic in the ntfy app.',
        fields: [
            { key: 'url', label: 'Topic URL', placeholder: 'https://ntfy.sh/my-servers' },
            { key: 'token', label: 'Access token', placeholder: 'Only for protected topics', optional: true },
        ],
    },
    {
        value: 'telegram',
        label: 'Telegram',
        help: 'Create a bot with @BotFather and send it a message. Your chat ID is shown by @userinfobot.',
        fields: [
            { key: 'token', label: 'Bot token', placeholder: '123456:ABC-DEF…' },
            { key: 'chat', label: 'Chat ID', placeholder: '123456789' },
        ],
    },
    { value: 'email', label: 'Email', help: 'Sent through the panel\'s mail settings.', fields: [{ key: 'address', label: 'Address', placeholder: 'you@example.com' }] },
    { value: 'webhook', label: 'Webhook', help: 'Receives a JSON POST with title, body, url and resolved.', fields: [{ key: 'url', label: 'URL', placeholder: 'https://example.com/hooks/alerts' }] },
];

export default function ChannelsScreen() {
    const queryClient = useQueryClient();
    const channels = useQuery({ queryKey: keys.channels, queryFn: getChannels });
    const [editing, setEditing] = useState<{ id?: number; input: ChannelInput } | null>(null);
    const [deleting, setDeleting] = useState<Channel | null>(null);
    const onError = (error: unknown) => toast.error(httpErrorToHuman(error));
    const update = (result: Channel[]) => queryClient.setQueryData(keys.channels, result);

    const saving = useMutation({ mutationFn: () => saveChannel(editing!.input, editing!.id), onSuccess: (result) => (update(result), setEditing(null)), onError });
    const removal = useMutation({ mutationFn: (id: number) => deleteChannel(id), onSuccess: (result) => (update(result), setDeleting(null)), onError });
    const testing = useMutation({ mutationFn: (id: number) => testChannel(id), onSuccess: () => toast.success('Test notification sent.'), onError });

    const type = TYPES.find((item) => item.value === editing?.input.type) ?? TYPES[0];
    const valid = editing !== null && editing.input.name.trim() !== '' && (editing.id !== undefined || type.fields.every((field) => field.optional || editing.input.config[field.key]?.trim()));

    return (
        <PageContentBlock title='Alerts'>
            <TitledGreyBox title='Notification channels'>
                <p className='mon:mb-4 mon:text-sm mon:text-muted-foreground'>Choose these channels in a server's Monitoring tab to get its alerts.</p>
                {!channels.data ? (
                    channels.isError ? <p className='mon:text-sm mon:text-destructive'>{httpErrorToHuman(channels.error)}</p> : <Spinner centered />
                ) : channels.data.length === 0 ? (
                    <p className='mon:text-sm mon:text-muted-foreground'>No channels yet.</p>
                ) : (
                    <ul className='mon:grid mon:grid-cols-1 mon:gap-3'>
                        {channels.data.map((channel) => (
                            <li key={channel.id} className='mon:flex mon:items-center mon:justify-between mon:gap-3 mon:rounded-sm mon:bg-sunken mon:px-4 mon:py-3'>
                                <div className='mon:min-w-0'>
                                    <p className='mon:truncate mon:text-sm mon:text-foreground' title={channel.name}>
                                        {channel.name}
                                    </p>
                                    <p className='mon:truncate mon:text-xs mon:text-muted-foreground' title={`${TYPES.find((item) => item.value === channel.type)?.label} · ${channel.summary}`}>
                                        {TYPES.find((item) => item.value === channel.type)?.label} · {channel.summary}
                                    </p>
                                </div>
                                <div className='mon:flex mon:shrink-0 mon:gap-2'>
                                    <Button.Text size='xsmall' disabled={testing.isPending} onClick={() => testing.mutate(channel.id)}>
                                        Test
                                    </Button.Text>
                                    <Button.Text size='xsmall' onClick={() => setEditing({ id: channel.id, input: { name: channel.name, type: channel.type, config: {} } })}>
                                        Edit
                                    </Button.Text>
                                    <Button.Danger size='xsmall' onClick={() => setDeleting(channel)}>
                                        Delete
                                    </Button.Danger>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <div className='mon:mt-4 mon:flex mon:justify-end'>
                    <Button size='small' onClick={() => setEditing({ input: { name: '', type: 'discord', config: {} } })}>
                        Add channel
                    </Button>
                </div>
            </TitledGreyBox>

            {editing && (
                <Dialog open onClose={() => setEditing(null)} title={editing.id ? 'Edit channel' : 'Add channel'} preventExternalClose={saving.isPending}>
                    <div className='mon:grid mon:grid-cols-1 mon:gap-4'>
                        <div className='mon:grid mon:grid-cols-1 mon:gap-4 mon:sm:grid-cols-2'>
                            <div>
                                <Label htmlFor='mon-name'>Name</Label>
                                <Input id='mon-name' placeholder='My Discord' value={editing.input.name} onChange={(event) => setEditing({ ...editing, input: { ...editing.input, name: event.currentTarget.value } })} />
                            </div>
                            <div>
                                <Label htmlFor='mon-type'>Type</Label>
                                <Select id='mon-type' value={editing.input.type} onChange={(value) => setEditing({ ...editing, input: { ...editing.input, type: value as ChannelType, config: {} } })} options={TYPES} />
                            </div>
                        </div>
                        {type.fields.map((field) => (
                            <div key={field.key}>
                                <Label htmlFor={`mon-${field.key}`}>{field.label}</Label>
                                <Input
                                    id={`mon-${field.key}`}
                                    placeholder={editing.id ? 'Leave empty to keep the saved value' : field.placeholder}
                                    value={editing.input.config[field.key] ?? ''}
                                    onChange={(event) => setEditing({ ...editing, input: { ...editing.input, config: { ...editing.input.config, [field.key]: event.currentTarget.value } } })}
                                />
                            </div>
                        ))}
                        <p className='mon:text-xs mon:text-muted-foreground'>{type.help}</p>
                    </div>
                    <Dialog.Footer>
                        <Button.Text className='mon:w-full mon:sm:w-auto' disabled={saving.isPending} onClick={() => setEditing(null)}>
                            Cancel
                        </Button.Text>
                        <Button className='mon:w-full mon:sm:w-auto' disabled={!valid} isLoading={saving.isPending} onClick={() => saving.mutate()}>
                            Save
                        </Button>
                    </Dialog.Footer>
                </Dialog>
            )}

            <Dialog.Confirm open={deleting !== null} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name}?`} confirm='Delete' pending={removal.isPending} onConfirmed={() => deleting && removal.mutate(deleting.id)}>
                Rules that use this channel stop sending notifications to it.
            </Dialog.Confirm>
        </PageContentBlock>
    );
}
