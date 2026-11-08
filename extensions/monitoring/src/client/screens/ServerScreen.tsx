import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ServerContentBlock, httpErrorToHuman, toast, useCurrentServerRequired, useServerPermission } from '@pterodactyl/sdk';
import { acknowledgeServerAlert, deleteServerRule, getHistory, getServer, keys, savePush, saveServerRule, type Range, type RuleInput, type ServerMonitoring } from '../api';
import AlertsTable from '../components/AlertsTable';
import HistoryCharts from '../components/HistoryCharts';
import KumaBox from '../components/KumaBox';
import RulesBox from '../components/RulesBox';

export default function ServerScreen() {
    const { identifier } = useCurrentServerRequired().attributes;
    const queryClient = useQueryClient();
    const canManage = useServerPermission('ext.monitoring.manage');
    const [range, setRange] = useState<Range>('24h');

    const history = useQuery({ queryKey: keys.history(identifier, range), queryFn: () => getHistory(identifier, range), refetchInterval: 60_000, placeholderData: (previous) => previous });
    const data = useQuery({ queryKey: keys.server(identifier), queryFn: () => getServer(identifier), refetchInterval: 60_000 });

    const update = (result: ServerMonitoring) => queryClient.setQueryData(keys.server(identifier), result);
    const onError = (error: unknown) => toast.error(httpErrorToHuman(error));

    const saving = useMutation({ mutationFn: ({ input, id }: { input: RuleInput; id?: number; done: () => void }) => saveServerRule(identifier, input, id), onSuccess: (result, { done }) => (update(result), done()), onError });
    const removal = useMutation({ mutationFn: ({ id }: { id: number; done: () => void }) => deleteServerRule(identifier, id), onSuccess: (result, { done }) => (update(result), done()), onError });
    const acknowledging = useMutation({ mutationFn: (id: number) => acknowledgeServerAlert(identifier, id), onSuccess: update, onError });
    const pushing = useMutation({
        mutationFn: (url: string | null) => savePush(identifier, url),
        onSuccess: (result, url) => (update(result), toast.success(url ? 'Connected. The first heartbeat is sent with the next sample.' : 'Disconnected from Uptime Kuma.')),
        onError,
    });

    return (
        <ServerContentBlock title='Monitoring'>
            <HistoryCharts history={history.data} error={history.error} range={range} onRange={setRange} />
            {data.data && (
                <div className='mon:mt-6 mon:grid mon:grid-cols-1 mon:gap-6 mon:lg:grid-cols-3'>
                    <section className='mon:min-w-0 mon:lg:col-span-2'>
                        <h2 className='mon:mb-3 mon:font-header mon:text-sm mon:font-semibold mon:uppercase mon:tracking-wide mon:text-foreground'>Alerts</h2>
                        <AlertsTable alerts={data.data.alerts} canAcknowledge={canManage} pending={acknowledging.isPending} onAcknowledge={(id) => acknowledging.mutate(id)} />
                    </section>
                    <div className='mon:grid mon:min-w-0 mon:grid-cols-1 mon:content-start mon:gap-6'>
                        <RulesBox
                            title='Alert rules'
                            rules={data.data.rules}
                            channels={data.data.channels}
                            canManage={canManage}
                            saving={saving.isPending}
                            removing={removal.isPending}
                            onSave={(input, id, done) => saving.mutate({ input, id, done })}
                            onDelete={(id, done) => removal.mutate({ id, done })}
                        />
                        {canManage && <KumaBox push={data.data.push} interval={history.data?.interval ?? 5} pending={pushing.isPending} onSave={(url) => pushing.mutate(url)} />}
                    </div>
                </div>
            )}
        </ServerContentBlock>
    );
}
