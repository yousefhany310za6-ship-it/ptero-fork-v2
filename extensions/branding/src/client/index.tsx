import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import { applyFavicon, setConfig } from './config.ts';
import { mountLogo } from './logo.ts';
import { settingsLink } from './kit/settings/SettingsLink';

export default definePterodactylExtension({
    setup({ config, screens, slots }) {
        screens.register('settings', () => import('./screens/SettingsScreen'));
        // Admin > Extensions: this extension's Settings button opens its settings page.
        slots.register('panel.extensions.before', settingsLink('branding', 'settings'));
        setConfig(config);

        // The server-rendered head already has the favicon; this also covers a change made in this tab
        // without reloading, and the head tag cache.
        applyFavicon();
        mountLogo();
    },
});
