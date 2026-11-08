import { Button, Dialog, NamedIcon, Portal, SpinnerOverlay } from '@pterodactyl/sdk';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import { RenameDialog } from './Dialogs';
import { usePending } from './kit';

/** What you picked, kept out of the way at the bottom of the list until you act on it. */
export default function Selection({ model, className }: ViewProps<'server.files.manager.selection'>) {
    const [pending, run] = usePending();
    const { selection, actions } = model;

    if (model.entries.length === 0) return null;

    return (
        <div className={className}>
            <SpinnerOverlay visible={pending} size='large' fixed />
            <Portal>
                {selection.length > 0 && (
                    <div className='pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4'>
                        <div
                            className={[
                                'pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-2',
                                'rounded-full border border-hairline bg-console-raised/95 py-2 pr-2 pl-4 shadow-2xl',
                                'backdrop-blur-md',
                            ].join(' ')}
                        >
                            <span className='flex items-center gap-2 fs-tiny font-semibold text-foreground'>
                                <span className='flex size-5 items-center justify-center rounded-full bg-primary fs-micro font-bold text-primary-foreground tabular-nums'>
                                    {selection.length}
                                </span>
                                selected
                            </span>
                            <span className='h-4 w-px bg-hairline' aria-hidden />
                            <Slot name='server.files.selectionActions' data={model.slot} />
                            <Dialog.Trigger
                                trigger={({ onClick }) => (
                                    <Button size='xsmall' color='grey' onClick={onClick}>
                                        <NamedIcon name='corner-left-up' className='size-3.5' aria-hidden />
                                        Move
                                    </Button>
                                )}
                            >
                                {({ open, onClose }) =>
                                    open ? (
                                        <RenameDialog model={model} files={[...selection]} move onClose={onClose} />
                                    ) : null
                                }
                            </Dialog.Trigger>
                            <Button
                                size='xsmall'
                                color='grey'
                                onClick={() => run(actions.archive(selection))}
                            >
                                <NamedIcon name='file-archive' className='size-3.5' aria-hidden />
                                Archive
                            </Button>
                            <Dialog.ConfirmTrigger
                                title='Delete files'
                                confirm='Delete'
                                trigger={({ onClick }) => (
                                    <Button size='xsmall' color='red' isSecondary onClick={onClick}>
                                        <NamedIcon name='trash-2' className='size-3.5' aria-hidden />
                                        Delete
                                    </Button>
                                )}
                                onConfirmed={(_event, close) => {
                                    close();
                                    run(actions.remove(selection));
                                }}
                            >
                                <p className='mb-2'>
                                    {selection.length} files go, and the panel cannot bring them back.
                                </p>
                                <ul className='mb-0 list-inside list-disc space-y-0.5 text-ink-secondary'>
                                    {selection.slice(0, 15).map((file) => (
                                        <li key={file} className='truncate font-mono fs-tiny'>
                                            {file}
                                        </li>
                                    ))}
                                    {selection.length > 15 && (
                                        <li className='text-ink-muted'>and {selection.length - 15} others</li>
                                    )}
                                </ul>
                            </Dialog.ConfirmTrigger>
                            <button
                                type='button'
                                onClick={() => actions.select([])}
                                aria-label='Clear the selection'
                                className='troxe-icon-btn !size-7'
                            >
                                <NamedIcon name='x' className='size-4' aria-hidden />
                            </button>
                        </div>
                    </div>
                )}
            </Portal>
        </div>
    );
}
