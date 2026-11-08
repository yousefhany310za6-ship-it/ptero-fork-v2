import { NamedIcon, TitledGreyBox } from '@pterodactyl/sdk';
import type { NodeHealth } from '../api';
import { HOST_UNKNOWN, cpuText } from '../lib/capacity';
import CapacityBar from './CapacityBar';
import Pill from './Pill';

function Note({ icon, children }: { icon: string; children: string }) {
    return (
        <p className='mon:flex mon:items-start mon:gap-1.5 mon:text-xs mon:leading-relaxed mon:text-muted-foreground'>
            <NamedIcon name={icon} aria-hidden className='mon:mt-0.5 mon:h-3.5 mon:w-3.5 mon:shrink-0' />
            <span className='mon:min-w-0'>{children}</span>
        </p>
    );
}

/** Memory, disk and CPU of one node. `wide` puts memory and disk side by side. */
export default function NodeCapacityCard({ node, wide = false }: { node: NodeHealth; wide?: boolean }) {
    const note = !node.panel_host ? HOST_UNKNOWN : !node.disk.host ? "Disk usage outside Pterodactyl is unknown: the panel cannot see this node's disk." : null;

    return (
        <TitledGreyBox
            className='mon:min-w-0'
            title={
                <div className='mon:flex mon:min-w-0 mon:items-center mon:justify-between mon:gap-3'>
                    <h3 className='mon:truncate mon:font-header mon:text-sm mon:font-semibold mon:uppercase mon:tracking-wide mon:text-foreground' title={node.name}>
                        {node.name}
                    </h3>
                    {node.reachable === false ? <Pill tone='danger'>Offline</Pill> : node.panel_host && <Pill>Runs the panel</Pill>}
                </div>
            }
        >
            <div className={`mon:grid mon:grid-cols-1 mon:gap-6 ${wide ? 'mon:md:grid-cols-2' : ''}`}>
                <CapacityBar label='Memory' capacity={node.memory} />
                <CapacityBar label='Disk' capacity={node.disk} />
            </div>
            <div className='mon:mt-4 mon:grid mon:grid-cols-1 mon:gap-1.5 mon:border-t mon:border-border mon:pt-3'>
                <Note icon='cpu'>{`CPU · ${cpuText(node.cpu)}`}</Note>
                {note && <Note icon='info'>{note}</Note>}
            </div>
        </TitledGreyBox>
    );
}
