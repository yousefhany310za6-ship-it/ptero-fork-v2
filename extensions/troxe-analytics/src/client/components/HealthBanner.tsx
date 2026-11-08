import { NamedIcon } from '@pterodactyl/sdk';
import type { Health } from '../api';
import { formatAgo } from '../lib/format';
import Pill from './Pill';

/**
 * Whether the figures below are being kept up to date, in one line.
 *
 * Analytics is not supposed to be noticed, so a healthy collection pass says nothing at all here:
 * the banner only appears when there is a reason the numbers on the screen are not current.
 */
export default function HealthBanner({ health }: { health: Health }) {
    if (health.collecting && health.warnings.length === 0) {
        return null;
    }

    const tone = health.level === 'paused' || !health.collecting ? 'danger' : 'warning';

    return (
        <div className={`trx:mb-6 trx:rounded-sm trx:border trx:bg-popover trx:p-4 ${tone === 'danger' ? 'trx:border-destructive/30' : 'trx:border-warning/30'}`}>
            <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-3'>
                <Pill tone={tone}>{health.collecting ? `Collection ${health.level}` : 'Collection off'}</Pill>
                <span className='trx:text-xs trx:text-muted-foreground'>Last pass {formatAgo(health.last_pass_at)}</span>
            </div>
            <ul className='trx:mt-2 trx:space-y-1'>
                {health.warnings.map((warning) => (
                    <li key={warning} className='trx:flex trx:items-start trx:gap-2 trx:text-sm trx:text-foreground/80'>
                        <NamedIcon name='triangle-alert' aria-hidden className='trx:mt-0.5 trx:h-4 trx:w-4 trx:shrink-0 trx:text-warning' />
                        <span className='trx:min-w-0'>{warning}</span>
                    </li>
                ))}
            </ul>
            {health.reasons.length > 0 && (
                <p className='trx:mt-2 trx:text-xs trx:text-muted-foreground'>Why: {health.reasons.join('; ')} — the panel and its containers were served first, and collection resumes on its own.</p>
            )}
        </div>
    );
}
