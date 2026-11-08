import { useQuery } from '@tanstack/react-query';
import { PanelLink } from '@pterodactyl/sdk';
import { getSummary, keys, type NodeCapacity } from '../api';
import { SEGMENT_LABELS } from '../lib/capacity';
import { CompactCapacity, Swatch } from './CapacityBar';
import StatTiles from './StatTiles';

const SHOWN = 6;

export default function OverviewWidget() {
    const summary = useQuery({ queryKey: keys.summary, queryFn: getSummary, refetchInterval: 60_000, retry: false });

    return summary.data ? (
        <>
            <StatTiles summary={summary.data} linked />
            {summary.data.capacity?.length > 0 && <CapacityOverview nodes={summary.data.capacity} />}
        </>
    ) : null;
}

/** Nodes needing attention first, so a long list still shows them. */
function CapacityOverview({ nodes }: { nodes: NodeCapacity[] }) {
    const pressure = (node: NodeCapacity) => node.memory.warnings.length + node.disk.warnings.length;
    const shown = [...nodes].sort((a, b) => pressure(b) - pressure(a)).slice(0, SHOWN);
    const measured = nodes.some((node) => node.panel_host);

    return (
        <section aria-label='Node capacity' className='mon:mb-6 mon:min-w-0 mon:rounded-sm mon:bg-card mon:p-5'>
            <div className='mon:mb-4 mon:flex mon:items-center mon:justify-between mon:gap-3'>
                <h2 className='mon:font-header mon:text-sm mon:font-semibold mon:uppercase mon:tracking-wide mon:text-foreground'>Node capacity</h2>
                <PanelLink destination={{ extension: 'monitoring', screen: 'admin' }} className='mon:shrink-0 mon:text-xs mon:text-muted-foreground mon:hover:text-foreground'>
                    {nodes.length > SHOWN ? `All ${nodes.length} nodes` : 'Details'}
                </PanelLink>
            </div>
            <ul className='mon:grid mon:grid-cols-1 mon:gap-4'>
                {shown.map((node) => (
                    <li key={node.id} className='mon:grid mon:grid-cols-1 mon:items-end mon:gap-x-6 mon:gap-y-2 mon:md:grid-cols-2 mon:xl:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)]'>
                        <p className='mon:truncate mon:text-sm mon:text-foreground mon:md:col-span-2 mon:xl:col-span-1' title={node.name}>
                            {node.name}
                            {node.reachable === false && <span className='mon:text-destructive'> · offline</span>}
                        </p>
                        <CompactCapacity label='Memory' capacity={node.memory} />
                        <CompactCapacity label='Disk' capacity={node.disk} />
                    </li>
                ))}
            </ul>
            <ul aria-label='Legend' className='mon:mt-4 mon:flex mon:flex-wrap mon:items-center mon:gap-x-3 mon:gap-y-1 mon:text-xs mon:text-muted-foreground'>
                {(measured ? (['servers', 'other', 'free'] as const) : (['servers', 'unused'] as const)).map((segment) => (
                    <li key={segment} className='mon:flex mon:items-center mon:gap-1.5 mon:whitespace-nowrap'>
                        <Swatch segment={segment} />
                        {segment === 'free' ? 'Free or not measured' : SEGMENT_LABELS[segment]}
                    </li>
                ))}
            </ul>
        </section>
    );
}
