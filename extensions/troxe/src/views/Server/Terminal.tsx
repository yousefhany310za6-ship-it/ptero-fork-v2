import type { KeyboardEvent } from 'react';
import { NamedIcon } from '@pterodactyl/sdk';
import { cn, type ServerConsoleCommand, type ViewProps } from '@pterodactyl/sdk/theme';

const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 fs-micro font-semibold';

const connection = {
    failed: { label: 'Connection error', ring: 'border-destructive/25 bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
    loading: { label: 'Connecting…', ring: 'border-warning/25 bg-warning/10', text: 'text-warning', dot: 'animate-beat bg-warning' },
    closed: { label: 'Disconnected', ring: 'border-hairline bg-veil', text: 'text-ink-secondary', dot: 'bg-muted-foreground' },
    readonly: { label: 'Read only', ring: 'border-hairline bg-veil', text: 'text-ink-secondary', dot: 'bg-muted-foreground' },
    connected: { label: 'Connected', ring: 'border-success/25 bg-success/10', text: 'text-success', dot: 'animate-beat bg-success' },
} as const;

const onCommandKey = (command: ServerConsoleCommand, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
        // Keeps the cursor at the end of the recalled command.
        event.preventDefault();
        command.previous();
    } else if (event.key === 'ArrowDown') {
        command.next();
    } else if (event.key === 'Enter') {
        command.submit();
    }
};

/** The design system's console chrome: a titled card, a connection chip, the log, and the prompt. */
export default function Terminal({ model, className }: ViewProps<'server.terminal'>) {
    const { command } = model;
    const state = model.failed
        ? connection.failed
        : model.loading
          ? connection.loading
          : command.disabled
            ? connection.closed
            : !command.allowed
              ? connection.readonly
              : connection.connected;

    return (
        <section aria-label='Console' className={cn('troxe-card flex flex-col', className)}>
            <header className='flex items-center gap-2.5 border-b border-hairline px-4 py-3 sm:px-5'>
                <NamedIcon name='square-terminal' className='size-4 shrink-0 text-ink-muted' aria-hidden />
                <h3 className='fs-body font-semibold'>Console</h3>
                <span className={cn(chip, state.ring, state.text)}>
                    <span className={cn('size-1.5 rounded-full', state.dot)} aria-hidden />
                    {state.label}
                </span>
                <div className='ml-auto flex items-center gap-0.5'>
                    {model.failed && (
                        <button type='button' onClick={model.retry} title='Load the console again' aria-label='Load the console again' className='troxe-icon-btn'>
                            <NamedIcon name='refresh-cw' className='size-4' aria-hidden />
                        </button>
                    )}
                    {model.scrolledUp && (
                        <button
                            type='button'
                            onClick={model.scrollToBottom}
                            title='Scroll to the newest output'
                            aria-label='Scroll to the newest output'
                            className='troxe-icon-btn'
                        >
                            <NamedIcon name='chevrons-down' className='size-4' aria-hidden />
                        </button>
                    )}
                </div>
            </header>

            {model.loading && (
                <p className='border-b border-hairline bg-veil/25 px-4 py-2 fs-tiny text-warning'>
                    Requesting a console ticket and opening the WebSocket…
                </p>
            )}

            <div className='relative h-[52vh] max-h-[32rem] min-h-[13.75rem] bg-terminal'>
                <model.Terminal className='troxe-log' />
                {model.failed && (
                    <div role='alert' className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-terminal p-4 text-center fs-small text-terminal-foreground'>
                        <p>The console could not be loaded.</p>
                        <button
                            type='button'
                            onClick={model.retry}
                            className='rounded-full border border-hairline px-3.5 py-1.5 fs-tiny font-bold text-ink-secondary transition-colors hover:border-hairline-hover hover:text-foreground'
                        >
                            Try again
                        </button>
                    </div>
                )}
            </div>

            {command.allowed ? (
                <div className='flex items-center gap-2 border-t border-hairline bg-console-raised px-3 py-2.5'>
                    <span className='shrink-0 font-mono fs-tiny text-ink-muted' aria-hidden>
                        $
                    </span>
                    <input
                        type='text'
                        aria-label='Console input'
                        placeholder={command.disabled ? 'Reconnect to send input' : 'Type a command and press Enter'}
                        autoComplete='off'
                        autoCorrect='off'
                        autoCapitalize='none'
                        spellCheck={false}
                        disabled={command.disabled}
                        value={command.value}
                        onChange={(event) => command.setValue(event.currentTarget.value)}
                        onKeyDown={(event) => onCommandKey(command, event)}
                        className='min-w-0 flex-1 bg-transparent py-1 font-mono fs-small text-terminal-foreground caret-terminal-foreground outline-none placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60'
                    />
                    <button
                        type='button'
                        onClick={command.submit}
                        disabled={command.disabled || !command.value.trim()}
                        aria-label='Send command'
                        className='troxe-inner flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary transition-[background-color,box-shadow,border-color] duration-150 hover:not-disabled:bg-primary hover:not-disabled:text-primary-foreground hover:not-disabled:shadow-[0_8px_22px_-12px_var(--brand-rim)] disabled:cursor-not-allowed disabled:opacity-40'
                    >
                        <NamedIcon name='arrow-up' className='size-4' aria-hidden />
                    </button>
                </div>
            ) : null}

            <footer className='flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2 font-mono fs-micro text-ink-muted'>
                <span>↑↓ history · Enter send</span>
                <span className='ml-auto'>Disconnecting never stops the server</span>
            </footer>
        </section>
    );
}
