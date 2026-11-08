import { Button, PanelLink, Table } from '@pterodactyl/sdk';
import type { Alert } from '../api';
import { formatAgo } from '../lib/format';
import Pill from './Pill';

interface Props {
    alerts: Alert[];
    showSubject?: boolean;
    canAcknowledge: boolean;
    pending: boolean;
    onAcknowledge: (id: number) => void;
}

export default function AlertsTable({ alerts, showSubject = false, canAcknowledge, pending, onAcknowledge }: Props) {
    return (
        <Table
            rows={alerts}
            keyOf={(alert) => String(alert.id)}
            emptyState='No alerts. Everything is fine.'
            columns={[
                {
                    id: 'status',
                    label: 'Status',
                    cell: (alert) =>
                        alert.resolved_at ? <Pill tone='success'>Resolved</Pill> : alert.acknowledged_at ? <Pill tone='warning'>Seen</Pill> : <Pill tone='danger'>Open</Pill>,
                },
                ...(showSubject
                    ? [
                          {
                              id: 'subject',
                              label: 'Server',
                              cell: (alert: Alert) =>
                                  alert.server ? (
                                      <PanelLink destination={{ extension: 'monitoring', screen: 'server', params: { id: alert.server.identifier } }} className='mon:block mon:min-w-32 mon:text-foreground mon:hover:underline'>
                                          {alert.server.name}
                                      </PanelLink>
                                  ) : (
                                      <span className='mon:block mon:min-w-32'>{`Node ${alert.node ?? ''}`}</span>
                                  ),
                          },
                      ]
                    : []),
                { id: 'rule', label: 'Rule', cell: (alert) => <span className='mon:block mon:min-w-40'>{alert.rule}</span> },
                {
                    id: 'value',
                    label: 'Peak',
                    cell: (alert) => (['cpu', 'memory', 'disk'].includes(alert.metric) ? `${alert.peak.toFixed(1)}%` : '–'),
                },
                {
                    id: 'started',
                    label: 'Started',
                    cell: (alert) => (
                        <span className='mon:whitespace-nowrap' title={new Date(alert.started_at).toLocaleString()}>
                            {formatAgo(alert.started_at)}
                        </span>
                    ),
                },
                {
                    id: 'resolved',
                    label: 'Resolved',
                    cell: (alert) =>
                        alert.resolved_at ? (
                            <span className='mon:whitespace-nowrap' title={new Date(alert.resolved_at).toLocaleString()}>
                                {formatAgo(alert.resolved_at)}
                            </span>
                        ) : (
                            '–'
                        ),
                },
                {
                    id: 'actions',
                    label: '',
                    cell: (alert) =>
                        canAcknowledge &&
                        !alert.resolved_at &&
                        !alert.acknowledged_at && (
                            <div className='mon:flex mon:justify-end mon:whitespace-nowrap'>
                                <Button.Text size='xsmall' disabled={pending} onClick={() => onAcknowledge(alert.id)}>
                                    Mark as seen
                                </Button.Text>
                            </div>
                        ),
                },
            ]}
        />
    );
}
