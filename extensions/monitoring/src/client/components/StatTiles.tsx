import { PanelLink } from '@pterodactyl/sdk';
import type { Headline } from '../api';

/** Four headline numbers, shared by the admin page and the overview widget. */
export default function StatTiles({ summary, linked = false }: { summary: Headline; linked?: boolean }) {
    const healthy = summary.scheduler.ok && summary.queue.ok;
    const tiles = [
        { label: 'Servers running', value: `${summary.servers.running} / ${summary.servers.total}`, tone: '' },
        { label: 'Nodes reachable', value: `${summary.nodes.reachable} / ${summary.nodes.total}`, tone: summary.nodes.reachable < summary.nodes.total ? 'mon:text-destructive' : '' },
        { label: 'Open alerts', value: String(summary.alerts), tone: summary.alerts > 0 ? 'mon:text-destructive' : '' },
        { label: 'Background jobs', value: healthy ? 'Running' : 'Stalled', tone: healthy ? 'mon:text-success' : 'mon:text-destructive' },
    ];

    return (
        <div className='mon:mb-6 mon:grid mon:grid-cols-2 mon:gap-3 mon:lg:grid-cols-4'>
            {tiles.map((tile) => {
                const content = (
                    <>
                        <p className='mon:truncate mon:text-sm mon:text-muted-foreground' title={tile.label}>
                            {tile.label}
                        </p>
                        <p className={`mon:mt-1 mon:truncate mon:font-header mon:text-2xl mon:font-semibold mon:text-foreground ${tile.tone}`} title={tile.value}>
                            {tile.value}
                        </p>
                    </>
                );
                const className = 'mon:block mon:min-w-0 mon:rounded-sm mon:border mon:border-transparent mon:bg-card mon:p-5 mon:no-underline';

                return linked ? (
                    <PanelLink key={tile.label} destination={{ extension: 'monitoring', screen: 'admin' }} className={`${className} mon:hover:border-border`}>
                        {content}
                    </PanelLink>
                ) : (
                    <div key={tile.label} className={className}>
                        {content}
                    </div>
                );
            })}
        </div>
    );
}
