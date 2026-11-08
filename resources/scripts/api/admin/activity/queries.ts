import {
    adminListActivityFilterOptionsOptions,
    adminListActivityOptions,
} from '@/api/generated/@tanstack/react-query.gen';
import type { AdminActivityLogResource, AdminListActivityData } from '@/api/generated';
import { activityLogQuery, type ActivityLogFilters } from '@/api/activity';

/** One row of the administration log, as the endpoint answers it. */
export type AdminActivityLog = AdminActivityLogResource;

export const adminActivityLogsQueryOptions = (filters?: ActivityLogFilters) =>
    adminListActivityOptions({ query: activityLogQuery(filters) satisfies AdminListActivityData['query'] });

export const adminActivityFacetsQueryOptions = () => adminListActivityFilterOptionsOptions();
