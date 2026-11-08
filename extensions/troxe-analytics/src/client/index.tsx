import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';

/**
 * Ten admin screens, each one a route the panel already protects: every endpoint they call is
 * mounted under /api/admin/extensions/troxe-analytics behind root-administrator authentication,
 * the two-factor check and the admin throttle. Nothing here is registered in the client area or
 * on a server page, because every figure is either the whole fleet or another customer's.
 */
export default definePterodactylExtension({
    setup({ screens }) {
        screens.register('overview', () => import('./screens/OverviewScreen'));
        screens.register('servers', () => import('./screens/ServersScreen'));
        screens.register('nodes', () => import('./screens/NodesScreen'));
        screens.register('resources', () => import('./screens/ResourcesScreen'));
        screens.register('customers', () => import('./screens/CustomersScreen'));
        screens.register('network', () => import('./screens/NetworkScreen'));
        screens.register('security', () => import('./screens/SecurityScreen'));
        screens.register('incidents', () => import('./screens/IncidentsScreen'));
        screens.register('reports', () => import('./screens/ReportsScreen'));
        screens.register('status', () => import('./screens/StatusScreen'));
    },
});
