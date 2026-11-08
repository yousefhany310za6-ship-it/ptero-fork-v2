import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, NamedIcon, Portal, Tooltip } from '@pterodactyl/sdk';
import { cn, type FileManagerModel } from '@pterodactyl/sdk/theme';
import { UploadsDialog } from './Dialogs';

const isFileOrDirectory = (event: DragEvent): boolean =>
    event.dataTransfer?.types.some((value) => value.toLowerCase() === 'files') ?? false;

/** Shows the drop target while files are dragged over the window. */
function useDropOverlay(): [boolean, (open: boolean) => void] {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const enter = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (isFileOrDirectory(event)) setOpen(true);
        };
        const hide = () => setOpen(false);

        window.addEventListener('dragenter', enter, { capture: true });
        window.addEventListener('dragexit', hide, { capture: true });
        window.addEventListener('keydown', hide);

        return () => {
            window.removeEventListener('dragenter', enter, true);
            window.removeEventListener('dragexit', hide, true);
            window.removeEventListener('keydown', hide);
        };
    }, []);

    return [open, setOpen];
}

export function UploadButton({ model }: { model: FileManagerModel }) {
    const input = useRef<HTMLInputElement>(null);
    const [dropping, setDropping] = useDropOverlay();
    // Failures have already been reported with error toasts.
    const upload = (files: FileList) => void model.actions.upload([...files]).catch(() => {});

    return (
        <>
            <Portal>
                {dropping && (
                    <div
                        className='fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-10 backdrop-blur-sm'
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setDropping(false);
                            if (event.dataTransfer?.files.length) upload(event.dataTransfer.files);
                        }}
                    >
                        <div className='troxe-card flex w-full max-w-sm items-center gap-4 p-6'>
                            <span className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-veil text-foreground'>
                                <NamedIcon name='cloud-upload' className='size-6' aria-hidden />
                            </span>
                            <p className='flex-1 text-center fs-lead font-semibold text-foreground'>
                                Drop to upload
                            </p>
                        </div>
                    </div>
                )}
            </Portal>
            <input
                type='file'
                ref={input}
                className='hidden'
                aria-label='Upload files'
                multiple
                onChange={(event) => {
                    if (event.currentTarget.files) upload(event.currentTarget.files);
                    event.currentTarget.value = '';
                }}
            />
            <Button size='small' color='grey' onClick={() => input.current?.click()}>
                <NamedIcon name='upload' className='size-4' aria-hidden />
                Upload
            </Button>
        </>
    );
}

/** The chip beside the toolbar buttons: how much of every upload has landed. */
export function UploadStatus({ model }: { model: FileManagerModel }) {
    const count = model.uploads.length;
    if (count === 0) return null;

    const loaded = model.uploads.reduce((sum, file) => sum + file.loaded, 0);
    const total = model.uploads.reduce((sum, file) => sum + file.total, 0);
    const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

    return (
        <Dialog.Trigger
            trigger={({ onClick }) => (
                <Tooltip content={`${count} uploading — click to view`}>
                    <button
                        type='button'
                        onClick={onClick}
                        className={cn(
                            'troxe-chip !gap-2 !py-1.5 !fs-tiny cursor-pointer',
                            'border-[var(--metric-cpu)]/30 bg-[var(--metric-cpu)]/10 text-[var(--metric-cpu)]',
                        )}
                    >
                        <NamedIcon name='cloud-upload' className='size-3.5 animate-beat' aria-hidden />
                        <span>
                            {count} uploading · {percent}%
                        </span>
                    </button>
                </Tooltip>
            )}
        >
            {({ open, onClose }) => (open ? <UploadsDialog model={model} onClose={onClose} /> : null)}
        </Dialog.Trigger>
    );
}
