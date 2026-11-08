import { DashboardAnnouncements } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

/** The classic banner stack: it renders exactly what the view's model carries, no requests of its own. */
export default function DashboardAnnouncementsView({ model, className }: ViewProps<'dashboard.announcements'>) {
    return <DashboardAnnouncements model={model} className={className} />;
}
