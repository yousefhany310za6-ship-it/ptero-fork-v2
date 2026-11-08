import { NamedIcon } from '@pterodactyl/sdk';
import { View, cn, type ViewProps } from '@pterodactyl/sdk/theme';

export default function Editor({ model, className }: ViewProps<'server.files.editor'>) {
    return (
        <div className={cn('troxe-card flex flex-col', className)}>
            <View name='server.files.editor.notice' model={model} />
            <View name='server.files.editor.canvas' model={model} />
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline bg-veil/40 px-3 py-2.5'>
                <View name='server.files.editor.language' model={model} />
                <div className='ml-auto flex items-center gap-3'>
                    {model.dirty && !model.readOnly && (
                        <span className='flex items-center gap-2 fs-micro text-caution'>
                            <span className='size-1.5 rounded-full bg-caution' aria-hidden />
                            Unsaved changes
                        </span>
                    )}
                    {!model.readOnly && (
                        <span className='hidden items-center gap-1 fs-micro text-ink-muted md:flex'>
                            <NamedIcon name='keyboard' className='size-3.5' aria-hidden />
                            Ctrl+S
                        </span>
                    )}
                    <View name='server.files.editor.actions' model={model} />
                </div>
            </div>
        </div>
    );
}
