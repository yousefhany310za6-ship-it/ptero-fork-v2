import { ListRow } from '@pterodactyl/sdk';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import { CardAvatar } from './kit';

/** The card's opening third: the mark, the name, and the line under it; slots stay for extensions. */
export default function ServerCardIdentity({ model, server, className }: ViewProps<'dashboard.serverCard.identity'>) {
    return (
        <div className={`flex min-w-0 items-center gap-4 col-span-12 sm:col-span-6 lg:col-span-5 ${className ?? ''}`}>
            <ListRow.Icon className='mr-0'>
                <CardAvatar>
                    {(model.name.trim()[0] || 'S').toUpperCase()}
                </CardAvatar>
            </ListRow.Icon>
            <div className='min-w-0'>
                <ListRow.Title>{model.name}</ListRow.Title>
                <ListRow.Description>{model.description ?? model.identifier}</ListRow.Description>
            </div>
            <Slot name='dashboard.serverRow.name.after' data={server} />
        </div>
    );
}
