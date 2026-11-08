import { useState } from 'react';
import { Button, Dialog, Input, Label, PanelLink, Select, Switch } from '@pterodactyl/sdk';
import type { ChannelOption, Metric, Rule, RuleInput } from '../api';

const METRICS: { value: Metric; label: string; global?: boolean }[] = [
    { value: 'cpu', label: 'CPU usage' },
    { value: 'memory', label: 'Memory usage' },
    { value: 'disk', label: 'Disk usage' },
    { value: 'offline', label: 'Server offline' },
    { value: 'node', label: 'Node unreachable', global: true },
];

interface Props {
    rule: Rule | null;
    channels: ChannelOption[];
    global?: boolean;
    pending: boolean;
    onClose: () => void;
    onSave: (input: RuleInput) => void;
}

export default function RuleDialog({ rule, channels, global = false, pending, onClose, onSave }: Props) {
    const [input, setInput] = useState<RuleInput>(
        rule ? { metric: rule.metric, threshold: rule.threshold || 90, minutes: rule.minutes, cooldown: rule.cooldown, enabled: rule.enabled, channels: rule.channels } : { metric: 'cpu', threshold: 90, minutes: 5, cooldown: 60, enabled: true, channels: channels.map((channel) => channel.id) }
    );
    const set = (changes: Partial<RuleInput>) => setInput((current) => ({ ...current, ...changes }));
    const usesThreshold = ['cpu', 'memory', 'disk'].includes(input.metric);

    return (
        <Dialog open onClose={onClose} title={rule ? 'Edit alert rule' : 'New alert rule'} preventExternalClose={pending}>
            <div className='mon:grid mon:grid-cols-1 mon:gap-4'>
                <div>
                    <Label htmlFor='mon-metric'>Alert when</Label>
                    <Select id='mon-metric' value={input.metric} onChange={(value) => set({ metric: value as Metric })} options={METRICS.filter((metric) => global || !metric.global)} />
                </div>
                <div className={`mon:grid mon:grid-cols-1 mon:gap-4 mon:sm:items-end ${usesThreshold ? 'mon:sm:grid-cols-3' : 'mon:sm:grid-cols-2'}`}>
                    {usesThreshold && (
                        <div>
                            <Label htmlFor='mon-threshold'>Above (%)</Label>
                            <Input id='mon-threshold' type='number' min={1} max={1000} value={input.threshold} onChange={(event) => set({ threshold: Number(event.currentTarget.value) })} />
                        </div>
                    )}
                    <div>
                        <Label htmlFor='mon-minutes'>For (minutes)</Label>
                        <Input id='mon-minutes' type='number' min={0} max={1440} value={input.minutes} onChange={(event) => set({ minutes: Number(event.currentTarget.value) })} />
                    </div>
                    <div>
                        <Label htmlFor='mon-cooldown'>Quiet for (minutes)</Label>
                        <Input id='mon-cooldown' type='number' min={0} max={10080} value={input.cooldown} onChange={(event) => set({ cooldown: Number(event.currentTarget.value) })} />
                    </div>
                </div>
                <p className='mon:-mt-2 mon:text-xs mon:text-muted-foreground'>
                    {usesThreshold && 'Usage is measured against the server\'s limit. '}
                    After a notification, the same alert stays quiet for the given minutes.
                </p>
                <div>
                    <Label htmlFor='mon-channels'>Notify</Label>
                    {channels.length === 0 ? (
                        <p className='mon:text-sm mon:text-muted-foreground'>
                            You have no notification channels yet. Add one under{' '}
                            <PanelLink destination={{ extension: 'monitoring', screen: 'alerts' }} className='mon:text-foreground mon:underline'>
                                Account → Alerts
                            </PanelLink>
                            . Alerts still show up here without one.
                        </p>
                    ) : (
                        <Select
                            id='mon-channels'
                            multiple
                            placeholder='No notifications'
                            value={input.channels}
                            onChange={(value) => set({ channels: value.map(Number) })}
                            options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
                        />
                    )}
                </div>
                <label className='mon:flex mon:items-center mon:justify-between mon:gap-3 mon:text-sm'>
                    <span>Enabled</span>
                    <Switch aria-label='Enabled' checked={input.enabled} onChange={() => set({ enabled: !input.enabled })} />
                </label>
            </div>
            <Dialog.Footer>
                <Button.Text className='mon:w-full mon:sm:w-auto' disabled={pending} onClick={onClose}>
                    Cancel
                </Button.Text>
                <Button className='mon:w-full mon:sm:w-auto' isLoading={pending} onClick={() => onSave(input)}>
                    Save
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
