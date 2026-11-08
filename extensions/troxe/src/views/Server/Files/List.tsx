import { createContext, memo, use, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    bytesToString,
    Button,
    Checkbox,
    cn,
    ContextDropdownMenu,
    Dialog,
    DropdownMenu,
    DropdownMenuItem,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    formatDate,
    fromNow,
    NamedIcon,
    PanelLink,
    SpinnerOverlay,
} from '@pterodactyl/sdk';
import { Slot, View, type FileManagerEntry, type FileManagerModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { ChmodDialog, NewDirectoryDialog, RenameDialog } from './Dialogs';
import { actionCell, byKind, columns, icon, modeCell, modeHead, sizeCell, sizeHead, timeCell, timeHead, usePending } from './kit';

const HOUR = 60 * 60 * 1000;

/** Recent files say "an hour ago"; older ones give the date, which is what you actually want. */
const modified = (at: string) => {
    const hours = Math.trunc((Date.parse(at) - Date.now()) / HOUR);

    return Math.abs(hours) > 48 ? formatDate(at, 'MMM Do, YYYY h:mmA') : fromNow(at);
};

type RowDialog = 'rename' | 'move' | 'chmod' | 'delete';

interface RowActions {
    readonly permissions: FileManagerModel['permissions'];
    readonly actions: FileManagerModel['actions'];
    readonly open: (dialog: RowDialog, entry: FileManagerEntry) => void;
    readonly run: (action: Promise<unknown>) => void;
    readonly toggle: (name: string, selected: boolean) => void;
}

const RowContext = createContext<RowActions | null>(null);
const SlotContext = createContext<FileManagerModel['slot'] | null>(null);

const useRows = (): RowActions => {
    const value = use(RowContext);
    if (!value) throw new Error('File rows render inside the file list.');

    return value;
};

/** Draws the row dialogs once, for whichever row asked. */
function RowActionsProvider({ model, children }: { model: FileManagerModel; children: ReactNode }) {
    const [dialog, setDialog] = useState<RowDialog | null>(null);
    const [target, setTarget] = useState<FileManagerEntry | null>(null);
    const [pending, run] = usePending();
    const selection = useRef(model.selection);
    const { actions, permissions } = model;

    selection.current = model.selection;

    const toggle = useCallback(
        (name: string, selected: boolean) =>
            actions.select(
                selected
                    ? [...selection.current.filter((file) => file !== name), name]
                    : selection.current.filter((file) => file !== name),
            ),
        [actions],
    );

    const value = useMemo<RowActions>(
        () => ({
            permissions,
            actions,
            run,
            toggle,
            open: (next, entry) => {
                setTarget(entry);
                setDialog(next);
            },
        }),
        [actions, permissions, run, toggle],
    );
    const close = () => setDialog(null);
    const name = target?.name ?? '';

    return (
        <RowContext.Provider value={value}>
            <SlotContext.Provider value={model.slot}>
                {children}
                <Dialog.Confirm
                    open={dialog === 'delete'}
                    onClose={close}
                    title={`Delete ${target?.kind === 'directory' ? 'folder' : 'file'}`}
                    confirm='Delete'
                    onConfirmed={() => {
                        close();
                        void actions.remove([name]).catch(() => {});
                    }}
                >
                    <span className='font-semibold text-foreground'>{name}</span> goes with it — the panel cannot
                    recover it afterwards.
                </Dialog.Confirm>
                {target && dialog === 'chmod' && (
                    <ChmodDialog key={name} model={model} file={name} mode={target.modeBits} onClose={close} />
                )}
                {target && (dialog === 'rename' || dialog === 'move') && (
                    <RenameDialog
                        key={`${dialog}:${name}`}
                        model={model}
                        files={[name]}
                        move={dialog === 'move'}
                        onClose={close}
                    />
                )}
                <SpinnerOverlay visible={pending} fixed size='large' />
            </SlotContext.Provider>
        </RowContext.Provider>
    );
}

function ActionItems({ entry }: { entry: FileManagerEntry }) {
    const { permissions, actions, open, run } = useRows();
    const isFile = entry.kind !== 'directory';

    return (
        <>
            {permissions.update && (
                <>
                    <DropdownMenuItem
                        icon={icon('pencil')}
                        onClick={() => open('rename', entry)}
                        description='Change the name'
                    >
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        icon={icon('corner-left-up')}
                        onClick={() => open('move', entry)}
                        description='Move to a path'
                    >
                        Move
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        icon={icon('file-code')}
                        onClick={() => open('chmod', entry)}
                        description='Edit the mode bits'
                    >
                        Permissions
                    </DropdownMenuItem>
                </>
            )}
            {isFile && permissions.create && (
                <DropdownMenuItem
                    icon={icon('copy')}
                    onClick={() => run(actions.copy(entry.name))}
                    description='Duplicate in place'
                >
                    Copy
                </DropdownMenuItem>
            )}
            {entry.extractable && permissions.create && permissions.update ? (
                <DropdownMenuItem
                    icon={icon('package-open')}
                    onClick={() => run(actions.extract(entry.name))}
                    description='Unpack its contents'
                >
                    Unarchive
                </DropdownMenuItem>
            ) : (
                permissions.archive && (
                    <DropdownMenuItem
                        icon={icon('file-archive')}
                        onClick={() => run(actions.archive([entry.name]))}
                        description='Compress it'
                    >
                        Archive
                    </DropdownMenuItem>
                )
            )}
            {isFile && (
                <DropdownMenuItem
                    icon={icon('file-down')}
                    onClick={() => run(actions.download(entry.name))}
                    description='Save it locally'
                >
                    Download
                </DropdownMenuItem>
            )}
            {permissions.delete && (
                <DropdownMenuItem
                    danger
                    icon={icon('trash-2')}
                    onClick={() => open('delete', entry)}
                    description='Remove it for good'
                    className='mt-1 border-t border-hairline pt-3'
                >
                    Delete
                </DropdownMenuItem>
            )}
            <RowActionsSlot entry={entry} />
        </>
    );
}

function RowActionsSlot({ entry }: { entry: FileManagerEntry }) {
    const slot = useContext(SlotContext);

    return slot ? <Slot name='server.files.rowActions' data={{ ...slot, file: entry.file }} /> : null;
}

const FileRow = memo(function FileRow({ entry, selected }: { entry: FileManagerEntry; selected: boolean }) {
    const { toggle } = useRows();
    const items = <ActionItems entry={entry} />;

    return (
        <ContextDropdownMenu
            className={[
                columns,
                'group cursor-pointer px-3 py-2 text-left no-underline transition-colors',
                selected ? 'bg-veil/70' : 'hover:bg-veil/45',
            ].join(' ')}
            menuClassName='w-64'
            items={items}
        >
            <Checkbox
                className='justify-self-start'
                name='selectedFiles'
                value={entry.name}
                aria-label={`Select ${entry.name}`}
                checked={selected}
                onChange={(checked) => toggle(entry.name, checked)}
            />
            {entry.destination ? (
                <PanelLink
                    aria-label={entry.name}
                    destination={entry.destination}
                    className='min-w-0 no-underline hover:text-foreground'
                >
                    <View name='server.files.details' file={entry.file} />
                </PanelLink>
            ) : (
                <div className='min-w-0 cursor-default'>
                    <View name='server.files.details' file={entry.file} />
                </div>
            )}
            {entry.kind === 'directory' ? (
                <span className={sizeCell} />
            ) : (
                <span className={sizeCell}>{bytesToString(entry.size)}</span>
            )}
            <span className={timeCell} title={entry.modifiedAt}>
                {modified(entry.modifiedAt)}
            </span>
            <span className={modeCell}>{entry.modeBits}</span>
            <span className={actionCell}>
                <DropdownMenu
                    className='w-64'
                    triggerClassName='troxe-icon-btn opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100'
                    triggerContent={
                        <>
                            <NamedIcon name='ellipsis' className='size-4' aria-hidden />
                            <span className='sr-only'>Options for {entry.name}</span>
                        </>
                    }
                >
                    {items}
                </DropdownMenu>
            </span>
        </ContextDropdownMenu>
    );
});

type SortKey = 'name' | 'size' | 'time' | 'mode';

const sortValue = (key: SortKey, entry: FileManagerEntry): string | number => {
    switch (key) {
        case 'size':
            return entry.kind === 'directory' ? -1 : entry.size;
        case 'time':
            return Date.parse(entry.modifiedAt);
        case 'mode':
            return entry.modeBits;
        default:
            return entry.name.toLowerCase();
    }
};

function Header({ sort, onSort }: { sort: { key: SortKey; dir: 1 | -1 }; onSort: (key: SortKey) => void }) {
    const label = (key: SortKey, text: string, cell: string) => (
        <button
            type='button'
            onClick={() => onSort(key)}
            className={[
                'items-center gap-1 fs-micro font-semibold uppercase tracking-[0.12em] transition-colors',
                sort.key === key ? 'text-foreground' : 'text-ink-muted hover:text-ink-secondary',
                cell,
            ].join(' ')}
        >
            {text}
            {sort.key === key && (
                <NamedIcon
                    name={sort.dir === 1 ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow'}
                    className='size-3'
                    aria-hidden
                />
            )}
        </button>
    );

    return (
        <div className={[columns, 'border-b border-hairline bg-veil/40 px-3 py-2'].join(' ')}>
            <span />
            {label('name', 'Name', 'flex justify-start')}
            {label('size', 'Size', sizeHead)}
            {label('time', 'Modified', timeHead)}
            {label('mode', 'Mode', modeHead)}
            <span className={actionCell}>
                <span className='sr-only'>Actions</span>
            </span>
        </div>
    );
}

function Skeleton() {
    return (
        <div className='divide-y divide-hairline' aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className={[columns, 'px-3 py-3 opacity-60'].join(' ')}>
                    <span className='size-4 rounded-md bg-veil' />
                    <span className='flex items-center gap-3'>
                        <span className='size-8 rounded-lg bg-veil' />
                        <span className='h-3 w-40 rounded-full bg-veil' />
                    </span>
                    <span className={`${sizeCell} h-3 rounded-full bg-veil`} />
                    <span className={`${timeCell} h-3 rounded-full bg-veil`} />
                    <span className={`${modeCell} h-3 rounded-full bg-veil`} />
                    <span className={actionCell} />
                </div>
            ))}
        </div>
    );
}

export default function List({ model, className }: ViewProps<'server.files.manager.list'>) {
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

    const entries = useMemo(() => {
        const list = [...model.entries];
        list.sort((a, b) => byKind(a, b) || sort.dir * (sortValue(sort.key, a) > sortValue(sort.key, b) ? 1 : -1));

        return list;
    }, [model.entries, sort]);

    if (model.loading) {
        return (
            <div className={['troxe-card', className].join(' ')}>
                <Skeleton />
            </div>
        );
    }

    if (!model.entries.length) {
        return (
            <Empty className={['min-h-[16rem]', className].join(' ')}>
                <EmptyHeader>
                    <EmptyMedia variant='icon'>
                        <NamedIcon name='folder-open' className='size-6' aria-hidden />
                    </EmptyMedia>
                    <EmptyTitle>This folder is empty</EmptyTitle>
                    <EmptyDescription>
                        {model.permissions.create
                            ? 'Drop files anywhere on the page, or create a file or folder to get started.'
                            : 'There are no files in this folder.'}
                    </EmptyDescription>
                </EmptyHeader>
                {model.permissions.create && (
                    <EmptyContent>
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
                    </EmptyContent>
                )}
            </Empty>
        );
    }

    const selected = new Set(model.selection);

    return (
        <div className={['troxe-card', className].join(' ')}>
            {model.truncated && (
                <div className='flex items-center justify-center gap-2 border-b border-hairline bg-warning/10 px-4 py-2.5'>
                    <NamedIcon name='triangle-alert' className='size-4 shrink-0 text-warning' aria-hidden />
                    <p className='fs-tiny text-warning-foreground dark:text-warning'>
                        This folder holds more than the panel lists — the first 250 entries only.
                    </p>
                </div>
            )}
            <RowActionsProvider model={model}>
                <Header sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))} />
                <div className='divide-y divide-hairline'>
                    {entries.map((entry) => (
                        <FileRow key={`${entry.kind}_${entry.name}`} entry={entry} selected={selected.has(entry.name)} />
                    ))}
                </div>
            </RowActionsProvider>
        </div>
    );
}
