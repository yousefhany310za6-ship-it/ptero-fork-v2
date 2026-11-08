import { SpinnerOverlay } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * The card is the editor's frame, so the canvas keeps the container's own height but squares off
 * its corners and stops short of the footer strip.
 */
export default function EditorCanvas({ model, className }: ViewProps<'server.files.editor.canvas'>) {
    return (
        <div className={cn('relative min-h-0 flex-1', className)} aria-busy={model.saving}>
            <SpinnerOverlay visible={model.saving} />
            <model.Editor className='h-[48dvh] min-h-64 sm:h-[calc(100dvh-21.5rem)] [&>.cm-editor]:rounded-none' />
        </div>
    );
}
