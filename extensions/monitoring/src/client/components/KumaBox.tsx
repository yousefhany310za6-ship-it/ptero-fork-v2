import { useState } from 'react';
import { Button, Input, TitledGreyBox } from '@pterodactyl/sdk';
import type { ServerMonitoring } from '../api';
import { formatAgo } from '../lib/format';
import Pill from './Pill';

interface Props {
    push: ServerMonitoring['push'];
    interval: number;
    pending: boolean;
    onSave: (url: string | null) => void;
}

export default function KumaBox({ push, interval, pending, onSave }: Props) {
    const [editing, setEditing] = useState(false);
    const [url, setUrl] = useState('');

    return (
        <TitledGreyBox title='Uptime Kuma'>
            {push && !editing ? (
                <div className='mon:grid mon:grid-cols-1 mon:gap-3 mon:text-sm'>
                    <div className='mon:flex mon:items-center mon:justify-between mon:gap-3'>
                        <span className='mon:min-w-0 mon:truncate mon:text-foreground' title={push.host}>
                            {push.host}
                        </span>
                        {push.last_error ? <Pill tone='danger'>Failing</Pill> : push.last_up === null ? <Pill>Waiting</Pill> : push.last_up ? <Pill tone='success'>Up</Pill> : <Pill tone='danger'>Down</Pill>}
                    </div>
                    <p className='mon:text-xs mon:break-words mon:text-muted-foreground'>{push.last_error ?? `Last heartbeat ${formatAgo(push.pushed_at)}.`}</p>
                    <div className='mon:flex mon:justify-end mon:gap-2'>
                        <Button.Text size='small' disabled={pending} onClick={() => onSave(null)}>
                            Remove
                        </Button.Text>
                        <Button.Text size='small' onClick={() => setEditing(true)}>
                            Change
                        </Button.Text>
                    </div>
                </div>
            ) : (
                <form
                    className='mon:grid mon:grid-cols-1 mon:gap-3'
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSave(url.trim());
                        setEditing(false);
                        setUrl('');
                    }}
                >
                    <p className='mon:text-sm mon:text-muted-foreground'>
                        Add a <span className='mon:text-foreground'>Push</span> monitor in Uptime Kuma with a heartbeat interval of {interval * 60 + 60} seconds, then paste its push URL here.
                    </p>
                    <Input aria-label='Push URL' type='url' placeholder='https://status.example.com/api/push/…' value={url} onChange={(event) => setUrl(event.currentTarget.value)} />
                    <div className='mon:flex mon:justify-end mon:gap-2'>
                        {push && (
                            <Button.Text size='small' type='button' onClick={() => setEditing(false)}>
                                Cancel
                            </Button.Text>
                        )}
                        <Button size='small' type='submit' disabled={!url.includes('/api/push/')} isLoading={pending}>
                            Connect
                        </Button>
                    </div>
                </form>
            )}
        </TitledGreyBox>
    );
}
