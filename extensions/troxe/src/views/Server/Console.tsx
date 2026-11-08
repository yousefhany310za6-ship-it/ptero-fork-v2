import { Alert, ServerContentBlock } from '@pterodactyl/sdk';
import { Slot, View, type ServerConsoleModel, type ViewProps } from '@pterodactyl/sdk/theme';

const notices = {
    maintenance: 'The node of this server is under maintenance, so most actions are unavailable.',
    installing: 'This server is still running its installation process, so most actions are unavailable.',
    transferring: 'This server is being transferred to another node, so all actions are unavailable.',
} satisfies Record<NonNullable<ServerConsoleModel['notice']>, string>;

export default function ConsolePage({ model, active, className }: ViewProps<'page.server.console'>) {
    return (
        <ServerContentBlock title={active ? 'Console' : undefined} className={className}>
            <div className='flex flex-col gap-4'>
                {model.notice && <Alert type='warning'>{notices[model.notice]}</Alert>}

                <Slot name='server.console.before' data={model.server} />

                <View name='server.power' />

                <p className='fs-small text-ink-secondary'>
                    Interactive TTY for <span className='font-mono font-semibold text-foreground'>{model.name}</span>.
                    {model.description ? ` ${model.description}` : ''}
                </p>

                <View name='server.terminal' />

                <View name='server.stats' />

                <Slot name='server.console.after' data={model.server} />

                {model.features.map((name) => (
                    <View key={name} name={name} />
                ))}
            </div>
        </ServerContentBlock>
    );
}
