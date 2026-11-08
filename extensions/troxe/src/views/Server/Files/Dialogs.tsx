import { useState, type ReactNode } from 'react';
import { Button, Code, Dialog, Input, Label, ProgressBar, SpinnerOverlay } from '@pterodactyl/sdk';
import { cn, type FileManagerModel } from '@pterodactyl/sdk/theme';

interface Prompt {
    title: string;
    description?: ReactNode;
    label: string;
    placeholder?: string;
    value: string;
    confirm: string;
    presets?: readonly string[];
    /** Shown under the field, in place of a preset row. */
    hint?: ReactNode;
    busy: boolean;
    onChange: (value: string) => void;
    onClose: () => void;
    onSubmit: (value: string) => void;
}

/** One labelled field and a confirm button: rename, move, new folder, chmod. */
export function PromptDialog({
    title,
    description,
    label,
    placeholder,
    value,
    confirm,
    presets,
    hint,
    busy,
    onChange,
    onClose,
    onSubmit,
}: Prompt) {
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (value.trim()) onSubmit(value);
    };

    return (
        <Dialog open onClose={onClose} title={title} description={description} preventExternalClose={busy}>
            <SpinnerOverlay visible={busy} />
            <form onSubmit={submit} className='space-y-4'>
                <div>
                    <Label htmlFor='troxe-prompt'>{label}</Label>
                    <div className='flex items-center gap-2'>
                        <Input
                            id='troxe-prompt'
                            autoFocus
                            spellCheck={false}
                            autoComplete='off'
                            className={cn('font-mono', presets && 'rounded-r-none')}
                            placeholder={placeholder}
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                        />
                        {presets && (
                            <div className='flex shrink-0 items-center gap-1 rounded-r-lg border border-l-0 border-hairline bg-input px-1.5'>
                                {presets.map((preset) => (
                                    <button
                                        key={preset}
                                        type='button'
                                        onClick={() => onChange(preset)}
                                        className='rounded-md px-1.5 py-1 font-mono fs-micro text-ink-muted transition-colors hover:bg-veil hover:text-foreground'
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {hint}
                </div>
            </form>
            <Dialog.Footer>
                <div className='flex w-full items-center justify-between gap-3'>
                    <span className='fs-micro text-ink-muted'>Enter to confirm</span>
                    <div className='flex shrink-0 gap-3'>
                        <Button type='button' size='small' color='grey' onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type='button'
                            size='small'
                            disabled={!value.trim() || busy}
                            onClick={() => value.trim() && onSubmit(value)}
                        >
                            {confirm}
                        </Button>
                    </div>
                </div>
            </Dialog.Footer>
        </Dialog>
    );
}

/** Renames one entry, or moves one or more to a path under the current directory. */
export function RenameDialog({
    model,
    files,
    move = false,
    onClose,
}: {
    model: FileManagerModel;
    files: readonly string[];
    move?: boolean;
    onClose: () => void;
}) {
    const [value, setValue] = useState(files.length > 1 ? '' : (files[0] ?? ''));
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        await (move
            ? model.actions.move(files, value)
            : model.actions.rename(files.map((from) => ({ from, to: value }))
            )
        ).catch(() => {});
        onClose();
    };

    return (
        <PromptDialog
            title={move ? 'Move' : 'Rename'}
            description={
                move
                    ? 'Give the new name and directory, relative to the folder being listed.'
                    : files.length > 1
                      ? `This renames ${files.length} files to the same name.`
                      : undefined
            }
            label={move ? 'New location' : 'Name'}
            placeholder={move ? 'uploads/2026/report.zip' : 'name'}
            value={value}
            confirm={move ? 'Move' : 'Rename'}
            busy={busy}
            onChange={setValue}
            onClose={onClose}
            onSubmit={run}
            hint={
                value.trim() && (
                    <p className='mt-2 break-all fs-micro text-ink-muted'>
                        {move ? 'New location: ' : 'Will become: '}
                        <Code>/home/container/{model.resolve(value)}</Code>
                    </p>
                )
            }
        />
    );
}

export function ChmodDialog({
    model,
    file,
    mode,
    onClose,
}: {
    model: FileManagerModel;
    file: string;
    mode: string;
    onClose: () => void;
}) {
    const [value, setValue] = useState(mode);
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        await model.actions.chmod([{ file, mode: value }]).catch(() => {});
        onClose();
    };

    return (
        <PromptDialog
            title='Permissions'
            description={`The mode of ${file}.`}
            label='Mode'
            placeholder='0644'
            value={value}
            confirm='Update'
            presets={['0644', '0755', '0600', '0775']}
            busy={busy}
            onChange={setValue}
            onClose={onClose}
            onSubmit={run}
        />
    );
}

export function NewDirectoryDialog({ model, onClose }: { model: FileManagerModel; onClose: () => void }) {
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        try {
            await model.actions.createDirectory(value);
            onClose();
        } catch {
            setBusy(false);
        }
    };

    return (
        <PromptDialog
            title='Create folder'
            label='Name'
            placeholder='uploads'
            value={value}
            confirm='Create'
            busy={busy}
            onChange={setValue}
            onClose={onClose}
            onSubmit={run}
            hint={
                value.trim() && (
                    <p className='mt-2 break-all fs-micro text-ink-muted'>
                        Created as <Code>/home/container/{model.resolve(value)}</Code>
                    </p>
                )
            }
        />
    );
}

const percent = (loaded: number, total: number) => (total > 0 ? (loaded / total) * 100 : 0);

export function UploadsDialog({ model, onClose }: { model: FileManagerModel; onClose: () => void }) {
    return (
        <Dialog open onClose={onClose} title='File uploads' description='These files are still going to your server.'>
            <ul className='space-y-3'>
                {model.uploads.map((file) => (
                    <li key={file.id} className='rounded-xl border border-hairline bg-veil/40 p-3'>
                        <div className='mb-2 flex items-baseline justify-between gap-3'>
                            <span className='truncate fs-small text-foreground'>{file.name}</span>
                            <span className='shrink-0 font-mono fs-micro text-ink-muted'>
                                {Math.floor(percent(file.loaded, file.total))}%
                            </span>
                        </div>
                        <ProgressBar variant='meter' value={percent(file.loaded, file.total)} label={file.name} />
                    </li>
                ))}
            </ul>
            <Dialog.Footer>
                <div className='flex w-full justify-end gap-3'>
                    <Button
                        size='small'
                        color='red'
                        isSecondary
                        onClick={() => {
                            model.actions.clearUploads();
                            onClose();
                        }}
                    >
                        Cancel uploads
                    </Button>
                    <Button size='small' color='grey' onClick={onClose}>
                        Close
                    </Button>
                </div>
            </Dialog.Footer>
        </Dialog>
    );
}
