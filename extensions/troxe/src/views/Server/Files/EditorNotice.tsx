import { Code, NamedIcon } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

export default function EditorNotice({ model, className }: ViewProps<'server.files.editor.notice'>) {
    return model.name.endsWith('.pteroignore') ? (
        <div className={cn('flex items-start gap-3 border-b border-hairline bg-caution/8 px-4 py-3', className)}>
            <NamedIcon name='shield' className='mt-0.5 size-4 shrink-0 text-caution' aria-hidden />
            <p className='fs-tiny text-ink-secondary'>
                Files and folders listed in a <Code>.pteroignore</Code> are left out of backups. An{' '}
                <span className='font-mono text-foreground'>*</span> matches a wildcard, and a rule is undone by
                prepending a <span className='font-mono text-foreground'>!</span> to it.
            </p>
        </div>
    ) : null;
}
