import { useState } from 'react';
import { Button, Dialog, TitledGreyBox } from '@pterodactyl/sdk';
import type { ChannelOption, Rule, RuleInput } from '../api';
import { plural } from '../lib/format';
import Pill from './Pill';
import RuleDialog from './RuleDialog';

interface Props {
    title: string;
    rules: Rule[];
    channels: ChannelOption[];
    canManage: boolean;
    global?: boolean;
    saving: boolean;
    removing: boolean;
    onSave: (input: RuleInput, id: number | undefined, done: () => void) => void;
    onDelete: (id: number, done: () => void) => void;
}

export default function RulesBox({ title, rules, channels, canManage, global, saving, removing, onSave, onDelete }: Props) {
    const [editing, setEditing] = useState<Rule | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Rule | null>(null);

    return (
        <TitledGreyBox title={title}>
            {rules.length === 0 ? (
                <p className='mon:text-sm mon:text-muted-foreground'>No rules yet.</p>
            ) : (
                <ul className='mon:grid mon:grid-cols-1 mon:gap-3'>
                    {rules.map((rule) => (
                        <li key={rule.id} className='mon:flex mon:flex-wrap mon:items-center mon:justify-between mon:gap-x-3 mon:gap-y-2'>
                            <div className='mon:min-w-0 mon:flex-1 mon:basis-40'>
                                <p className='mon:truncate mon:text-sm mon:text-foreground' title={rule.description}>
                                    {rule.description}
                                </p>
                                <p className='mon:truncate mon:text-xs mon:text-muted-foreground' title={rule.mine ? undefined : `Set up by ${rule.owner}`}>
                                    {rule.mine ? (rule.channels.length ? `Notifies ${plural(rule.channels.length, 'channel')}` : 'No notifications') : `Set up by ${rule.owner}`}
                                </p>
                            </div>
                            <div className='mon:ml-auto mon:flex mon:shrink-0 mon:items-center mon:gap-2'>
                                {!rule.enabled && <Pill>Paused</Pill>}
                                {canManage && (
                                    <>
                                        <Button.Text size='xsmall' onClick={() => setEditing(rule)}>
                                            Edit
                                        </Button.Text>
                                        <Button.Danger size='xsmall' onClick={() => setDeleting(rule)}>
                                            Delete
                                        </Button.Danger>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {canManage && (
                <div className='mon:mt-4 mon:flex mon:justify-end'>
                    <Button size='small' onClick={() => setEditing('new')}>
                        New rule
                    </Button>
                </div>
            )}
            {editing && (
                <RuleDialog
                    rule={editing === 'new' ? null : editing}
                    channels={channels}
                    global={global}
                    pending={saving}
                    onClose={() => setEditing(null)}
                    onSave={(input) => onSave(input, editing === 'new' ? undefined : editing.id, () => setEditing(null))}
                />
            )}
            <Dialog.Confirm
                open={deleting !== null}
                onClose={() => setDeleting(null)}
                title='Delete this rule?'
                confirm='Delete'
                pending={removing}
                onConfirmed={() => deleting && onDelete(deleting.id, () => setDeleting(null))}
            >
                {deleting?.description}. Its alert history is deleted too.
            </Dialog.Confirm>
        </TitledGreyBox>
    );
}
