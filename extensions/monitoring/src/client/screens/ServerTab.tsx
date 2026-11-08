import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentResource } from '@pterodactyl/sdk';
import { getAdminHistory, keys, type Range } from '../api';
import HistoryCharts from '../components/HistoryCharts';

export default function ServerTab() {
    const context = useCurrentResource();
    const id = context?.kind === 'admin.server' ? context.resource.attributes.id : 0;
    const [range, setRange] = useState<Range>('24h');
    const history = useQuery({ queryKey: keys.adminHistory(id, range), queryFn: () => getAdminHistory(id, range), enabled: id > 0, placeholderData: (previous) => previous });

    return <HistoryCharts history={history.data} error={history.error} range={range} onRange={setRange} />;
}
