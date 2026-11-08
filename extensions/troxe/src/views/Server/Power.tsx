import type { CSSProperties } from 'react';
import { Button, Dialog, NamedIcon } from '@pterodactyl/sdk';
import { Slot, cn, type ServerRunState, type ViewProps } from '@pterodactyl/sdk/theme';

type Tone = 'online' | 'pending' | 'error' | 'offline';

const tones: Record<Tone, { glow: string; text: string; ring: string }> = {
    online: { glow: '16,185,129', text: 'text-success', ring: 'border-success/30 bg-success/10' },
    pending: { glow: '245,158,11', text: 'text-warning', ring: 'border-warning/30 bg-warning/10' },
    error: { glow: '239,68,68', text: 'text-destructive', ring: 'border-destructive/30 bg-destructive/10' },
    offline: { glow: '113,113,122', text: 'text-ink-secondary', ring: 'border-hairline bg-veil' },
};

const states: Record<ServerRunState | 'unknown', { label: string; sub: string; tone: Tone }> = {
    running: { label: 'Running', sub: 'The container is up and streaming output.', tone: 'online' },
    starting: { label: 'Starting', sub: 'This usually takes a few seconds.', tone: 'pending' },
    stopping: { label: 'Stopping', sub: 'Waiting for the process to exit.', tone: 'pending' },
    offline: { label: 'Stopped', sub: 'Start the server to open the console.', tone: 'offline' },
    unknown: { label: 'No report', sub: 'The node has not sent a state for this server.', tone: 'error' },
};

/** The status hero from the design system: a tinted card, the state, and the power signals beside it. */
export default function Power({ model, className }: ViewProps<'server.power'>) {
    const { permissions, enabled, actions } = model;
    const state = states[model.state ?? 'unknown'];
    const tone = tones[state.tone];
    const attributes = model.server.attributes;
    const chips = [
        attributes.node && { icon: 'map-pin', label: attributes.node },
        attributes.egg_tags?.[0] && { icon: 'package', label: attributes.egg_tags[0] },
        attributes.docker_image.split('/').pop() && {
            icon: 'box',
            label: attributes.docker_image.split('/').pop()!,
        },
        model.connected ? null : { icon: 'wifi-off', label: 'console offline' },
    ].filter((chip): chip is { icon: string; label: string } => Boolean(chip));

    return (
        <section
            className={cn('troxe-card troxe-glow p-5 sm:p-6', className)}
            style={{ '--card-glow': `rgba(${tone.glow}, 0.14)` } as CSSProperties}
        >
            <Slot name='server.console.power.before' data={model.server} />
            <div className='relative flex flex-wrap items-center gap-x-6 gap-y-4'>
                <div className='flex min-w-0 items-center gap-4'>
                    <span
                        className={cn(
                            'troxe-inner relative flex size-14 shrink-0 items-center justify-center border',
                            tone.ring,
                            tone.text,
                        )}
                    >
                        <NamedIcon name='power' className='size-6' aria-hidden />
                        {state.tone === 'online' && (
                            <span className='absolute -top-1 -right-1 size-3 animate-beat rounded-full border-2 border-console bg-success' />
                        )}
                    </span>
                    <div className='min-w-0'>
                        <p className={cn('fs-display leading-none font-extrabold', tone.text)}>{state.label}</p>
                        <p className='mt-1.5 fs-small text-ink-secondary'>{state.sub}</p>
                    </div>
                </div>

                <div className='flex flex-wrap items-center gap-2 sm:ml-auto'>
                    {chips.map((chip) => (
                        <span key={chip.label} className='troxe-chip'>
                            <NamedIcon name={chip.icon} className='size-3 shrink-0' aria-hidden />
                            {chip.label}
                        </span>
                    ))}
                    {(permissions.start || permissions.stop || permissions.restart) && (
                        <div className='flex flex-wrap items-center gap-2'>
                            {permissions.start && (
                                <Button size='small' disabled={!enabled.start} onClick={actions.start}>
                                    <NamedIcon name='play' className='size-3.5 shrink-0' aria-hidden />
                                    Start
                                </Button>
                            )}
                            {permissions.restart && (
                                <Button.Text size='small' disabled={!enabled.restart} onClick={actions.restart}>
                                    <NamedIcon name='rotate-ccw' className='size-3.5 shrink-0' aria-hidden />
                                    Restart
                                </Button.Text>
                            )}
                            {permissions.stop &&
                                (model.killable ? (
                                    <Dialog.ConfirmTrigger
                                        key='killable'
                                        hideCloseIcon
                                        title='Forcibly stop the process'
                                        confirm='Continue'
                                        trigger={({ onClick }) => (
                                            <Button.Danger size='small' disabled={!enabled.kill} onClick={onClick}>
                                                <NamedIcon name='square' className='size-3 shrink-0' aria-hidden />
                                                Kill
                                            </Button.Danger>
                                        )}
                                        onConfirmed={(_event, close) => {
                                            close();
                                            actions.kill();
                                        }}
                                    >
                                        Forcibly stopping a server can lead to data corruption.
                                    </Dialog.ConfirmTrigger>
                                ) : (
                                    <Button.Danger key='stoppable' size='small' disabled={!enabled.stop} onClick={actions.stop}>
                                        <NamedIcon name='square' className='size-3 shrink-0' aria-hidden />
                                        Stop
                                    </Button.Danger>
                                ))}
                        </div>
                    )}
                </div>
            </div>
            <Slot name='server.console.power.after' data={model.server} />
        </section>
    );
}
