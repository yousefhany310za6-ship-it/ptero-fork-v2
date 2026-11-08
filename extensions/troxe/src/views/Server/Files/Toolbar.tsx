import { Button, Checkbox, Dialog, ErrorBoundary, NamedIcon, PanelLink, Spinner } from '@pterodactyl/sdk';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import Crumbs, { containerPath } from './Crumbs';
import { NewDirectoryDialog } from './Dialogs';
import { UploadButton, UploadStatus } from './Uploads';

export default function Toolbar({ model, className }: ViewProps<'server.files.manager.toolbar'>) {
    const { entries, selection, permissions, actions } = model;
    const all = entries.length > 0 && selection.length === entries.length;

    return (
        <ErrorBoundary>
            <div
                className={[
                    'mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
                    className,
                ].join(' ')}
            >
                <div className='flex min-w-0 items-center gap-1'>
                    <Checkbox
                        className='ml-1 mr-2 shrink-0'
                        aria-label='Select all files'
                        checked={all}
                        indeterminate={selection.length > 0 && !all}
                        onChange={(checked) => actions.select(checked ? entries.map((entry) => entry.name) : [])}
                    />
                    <Crumbs crumbs={model.breadcrumbs} root={model.newFileDestination} copy={containerPath(model.directory)} />
                </div>
                {permissions.create && (
                    <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
                        <UploadStatus model={model} />
                        <Dialog.Trigger
                            trigger={({ onClick }) => (
                                <Button size='small' color='grey' onClick={onClick}>
                                    <NamedIcon name='folder-plus' className='size-4' aria-hidden />
                                    New folder
                                </Button>
                            )}
                        >
                            {({ open, onClose }) => (open ? <NewDirectoryDialog model={model} onClose={onClose} /> : null)}
                        </Dialog.Trigger>
                        {permissions.update && <UploadButton model={model} />}
                        <PanelLink destination={model.newFileDestination}>
                            <Button size='small'>
                                <NamedIcon name='file-plus' className='size-4' aria-hidden />
                                New file
                            </Button>
                        </PanelLink>
                        <button
                            type='button'
                            className='troxe-icon-btn'
                            aria-label='Refresh this folder'
                            disabled={model.refreshing}
                            onClick={() => void actions.refresh().catch(() => {})}
                        >
                            {model.refreshing ? (
                                <Spinner size='small' />
                            ) : (
                                <NamedIcon name='refresh-cw' className='size-4' />
                            )}
                        </button>
                    </div>
                )}
            </div>
            <Slot name='server.files.toolbar' data={model.slot} />
        </ErrorBoundary>
    );
}
