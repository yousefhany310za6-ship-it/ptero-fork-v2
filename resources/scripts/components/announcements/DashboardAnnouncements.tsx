import { useState } from 'react';
import AnnouncementBanner from '@/components/announcements/AnnouncementBanner';
import AnnouncementModal from '@/components/announcements/AnnouncementModal';
import type { AnnouncementsModel } from '@/views/dashboard';

export interface DashboardAnnouncementsProps {
    /** The engine's model for the banner stack; its only data source, so fixtures render unchanged. */
    model: AnnouncementsModel;
    className?: string;
}

/**
 * Banner stack at the top of the user dashboard. Visibility, ordering, and
 * hide-state are all decided server-side (database-backed interactions — a
 * dismissal survives refresh, logout, and other devices); this component only
 * renders what the model carries.
 *
 * `modal` announcements render as popups instead of stack items — they block
   until the user acknowledges or dismisses them, so critical notices cannot be
   scrolled past unnoticed.
 */
export default function DashboardAnnouncements({ model, className }: DashboardAnnouncementsProps) {
    // A dismissed `every_visit` banner resurfaces next visit by design — hide it for this view now.
    const [hiddenLocally, setHiddenLocally] = useState<Record<number, boolean>>({});
    const items = model.items.filter((item) => !hiddenLocally[item.id]);

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={['mb-5 flex flex-col gap-3', className].filter(Boolean).join(' ')} aria-label='Announcements'>
            {items.map((item) => {
                if (item.displayType === 'modal') {
                    return (
                        <AnnouncementModal
                            key={`${item.id}@${item.version}-modal`}
                            open={!hiddenLocally[item.id]}
                            kind={item.kind}
                            tag={item.tag ?? undefined}
                            title={item.title}
                            body={item.body}
                            policy={item.policy}
                            requireAck={item.requireAck}
                            ackedAt={item.ackedAt}
                            actionLabel={item.actionLabel}
                            actionUrl={item.actionUrl}
                            eventStart={item.eventStart}
                            eventEnd={item.eventEnd}
                            onAck={() => model.actions.acknowledge(item.id)}
                            onDismiss={() => {
                                if (item.policy === 'every_visit' && !item.requireAck) {
                                    setHiddenLocally((hidden) => ({ ...hidden, [item.id]: true }));
                                }

                                model.actions.dismiss(item);
                            }}
                            ackBusy={model.busy}
                            dismissBusy={model.busy}
                        />
                    );
                }

                return (
                    <AnnouncementBanner
                        key={`${item.id}@${item.version}`}
                        kind={item.kind}
                        tag={item.tag ?? undefined}
                        title={item.title}
                        body={item.body}
                        policy={item.policy}
                        requireAck={item.requireAck}
                        ackedAt={item.ackedAt}
                        actionLabel={item.actionLabel}
                        actionUrl={item.actionUrl}
                        eventStart={item.eventStart}
                        eventEnd={item.eventEnd}
                        ackBusy={model.busy}
                        dismissBusy={model.busy}
                        onAck={() => model.actions.acknowledge(item.id)}
                        onDismiss={() => {
                            if (item.policy === 'every_visit' && !item.requireAck) {
                                setHiddenLocally((hidden) => ({ ...hidden, [item.id]: true }));
                            }

                            model.actions.dismiss(item);
                        }}
                    />
                );
            })}
        </div>
    );
}
