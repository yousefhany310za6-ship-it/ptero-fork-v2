import { Button, NamedIcon } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

export default function EditorActions({ model, className }: ViewProps<'server.files.editor.actions'>) {
    if (model.readOnly) {
        return (
            <span className={cn('troxe-chip shrink-0 !py-1.5 fs-micro', className)}>
                <NamedIcon name='lock' className='size-3.5' aria-hidden />
                Read only
            </span>
        );
    }

    return (
        <Button
            className={cn('shrink-0', className)}
            size='small'
            disabled={model.saving || (!model.dirty && !model.isNew)}
            isLoading={model.saving}
            onClick={() => void model.save()}
        >
            {model.isNew ? 'Create file' : 'Save'}
        </Button>
    );
}
