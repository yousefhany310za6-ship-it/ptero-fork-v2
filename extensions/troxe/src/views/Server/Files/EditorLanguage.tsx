import { Select } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

export default function EditorLanguage({ model, className }: ViewProps<'server.files.editor.language'>) {
    return (
        <div className={cn('flex min-w-0 items-center gap-2', className)}>
            <span className='hidden fs-micro font-semibold uppercase tracking-[0.12em] text-ink-muted sm:block'>
                Syntax
            </span>
            <div className='w-40 min-w-0 shrink-0 sm:w-56'>
                <Select
                    aria-label='Syntax highlighting'
                    value={model.language}
                    onChange={(value) => model.setLanguage(String(value))}
                    disabled={model.saving}
                    options={model.languages.map((language) => ({ value: language.mime, label: language.name }))}
                />
            </div>
        </div>
    );
}
