import { useAnnouncementStats, type AnnouncementItem } from '@/api/admin/announcements/queries';
import { httpErrorToHuman } from '@/api/http';
import Button from '@/components/elements/Button';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';

interface Props {
    announcement: AnnouncementItem;
    open: boolean;
    onClose: () => void;
}

const StatTile = ({ label, value, hint }: { label: string; value: number | string; hint?: string }) => (
    <div className='rounded-xl border border-border bg-card p-4'>
        <p className='text-xs font-bold uppercase tracking-wide text-muted-foreground'>{label}</p>
        <p className='mt-1 text-2xl font-extrabold tabular-nums text-foreground'>{value}</p>
        {hint && <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>}
    </div>
);

export default function AnnouncementStatsDialog({ announcement, open, onClose }: Props) {
    const { id, name, content_version: contentVersion } = announcement.attributes;
    const { data, error, isPending } = useAnnouncementStats(id, open);

    return (
        <Dialog open={open} title={`Statistics · ${name}`} onClose={onClose}>
            {isPending && <Spinner size='small' />}
            {error && <p className='text-sm text-destructive'>{httpErrorToHuman(error)}</p>}
            {data && (
                <div className='grid gap-3 sm:grid-cols-2'>
                    <StatTile
                        label='Eligible users'
                        value={data.eligible}
                        hint='Audience size right now; deleted accounts drop out automatically.'
                    />
                    <StatTile
                        label='Version'
                        value={`v${data.content_version}`}
                        hint='Counts below are distinct users for this version only.'
                    />
                    <StatTile label='Seen' value={data.shown} hint='Users with at least one impression.' />
                    <StatTile label='Acknowledged' value={data.acked} />
                    <StatTile label='Dismissed' value={data.dismissed} />
                    <div className='flex items-end justify-end sm:col-span-2'>
                        <Button.Text type='button' isSecondary onClick={onClose}>
                            Close
                        </Button.Text>
                    </div>
                </div>
            )}
            {data && contentVersion !== data.content_version && (
                <p className='mt-2 text-xs text-warning'>
                    The banner changed since this list was fetched — reload to see the new version.
                </p>
            )}
        </Dialog>
    );
}
