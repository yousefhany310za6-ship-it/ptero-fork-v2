import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import OverviewWidget from './components/OverviewWidget';

export default definePterodactylExtension({
    setup({ screens, slots }) {
        screens.register('server', () => import('./screens/ServerScreen'));
        screens.register('alerts', () => import('./screens/ChannelsScreen'));
        screens.register('admin', () => import('./screens/AdminScreen'));
        screens.register('server-tab', () => import('./screens/ServerTab'));
        slots.register('panel.overview.before', OverviewWidget);
    },
});
