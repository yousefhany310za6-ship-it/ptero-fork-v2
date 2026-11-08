import { NamedIcon, cn } from '@pterodactyl/sdk';
import { View, type ViewProps } from '@pterodactyl/sdk/theme';

/** One small power signal button: permission-gated, and all three sleep while a signal travels. */
function PowerButton({ enabled, sending, tone, label, icon, onClick }: {
    enabled: boolean;
    sending: boolean;
    tone?: string;
    label: string;
    icon: string;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            onClick={onClick}
            disabled={!enabled || sending}
            title={enabled ? label : `${label} — not allowed for your account`}
            aria-label={label}
            className={cn(
                'troxe-icon-btn cursor-pointer appearance-none border border-transparent',
                tone,
                'hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
            )}
        >
            <NamedIcon name={icon} className='size-3.5' aria-hidden />
        </button>
    );
}

/** The quick power trio, drawn only when the server is on a node that reports states. */
function PowerGroup({ model, className }: { model: ViewProps<'dashboard.serverCard'>['model']; className?: string }) {
    if (model.state.kind !== 'ready') return <div className={className} />;

    return (
        <div
            className={cn('col-span-12 flex items-center justify-center gap-1.5 lg:col-span-1 lg:flex-col', className)}
            role='group'
            aria-label={`Power — ${model.name}`}
        >
            <PowerButton
                label='Start'
                icon='play'
                enabled={model.permissions.start}
                sending={model.sending}
                onClick={model.actions.start}
            />
            <PowerButton
                label='Restart'
                icon='rotate-cw'
                enabled={model.permissions.restart}
                sending={model.sending}
                onClick={model.actions.restart}
            />
            <PowerButton
                label='Stop'
                icon='square'
                tone='hover:!border-destructive/40 hover:!bg-destructive/10 hover:!text-destructive'
                enabled={model.permissions.stop}
                sending={model.sending}
                onClick={model.actions.stop}
            />
        </div>
    );
}

/** The card's pieces are views of their own, so a theme replaces one and keeps the others. */
export default function ServerCard({ model, server, className }: ViewProps<'dashboard.serverCard'>) {
    return (
        <div className={cn('grid grid-cols-12 gap-x-3 gap-y-3', className)}>
            <View name='dashboard.serverCard.identity' model={model} server={server} />
            <View name='dashboard.serverCard.address' model={model} server={server} />
            <View name='dashboard.serverCard.metrics' model={model} server={server} />
            <PowerGroup model={model} />
        </div>
    );
}
