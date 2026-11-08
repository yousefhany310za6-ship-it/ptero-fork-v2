import { ErrorBoundary, ServerContentBlock, ServerError, Spinner } from '@pterodactyl/sdk';
import { View, type ViewProps } from '@pterodactyl/sdk/theme';
import Crumbs, { containerPath } from './Crumbs';

const widths = [62, 40, 74, 55, 30, 68, 44, 80, 26, 58, 36, 70, 48, 22];

/** The shape of the card the document is about to fill. */
function Loading() {
    return (
        <div className='troxe-card'>
            <div className='h-[48dvh] min-h-64 space-y-2.5 p-4 sm:h-[calc(100dvh-21.5rem)]' aria-hidden>
                {widths.map((width, index) => (
                    <span key={index} className='block h-2.5 rounded-full bg-veil' style={{ width: `${width}%` }} />
                ))}
            </div>
            <div className='flex items-center border-t border-hairline bg-veil/40 px-3 py-3'>
                <Spinner size='small' />
            </div>
        </div>
    );
}

export default function EditorPage({ model, className }: ViewProps<'page.server.files.editor'>) {
    if (model.error !== null) {
        return <ServerError message={model.error} onBack={model.back} className={className} />;
    }

    const directory = model.breadcrumbs[model.breadcrumbs.length - 1]?.path ?? '/';

    return (
        <ServerContentBlock title={model.file ? `Editing ${model.file}` : 'New file'} className={className}>
            <div className='flex min-w-0 flex-col gap-4'>
                <ErrorBoundary>
                    <Crumbs
                        crumbs={model.breadcrumbs}
                        file={model.file}
                        onBack={model.back}
                        copy={containerPath(model.file ? `${directory}/${model.file}` : directory)}
                        copyLabel={model.file ?? 'this folder'}
                    />
                </ErrorBoundary>
                {model.loading ? <Loading /> : <View name='server.files.editor' />}
            </div>
        </ServerContentBlock>
    );
}
