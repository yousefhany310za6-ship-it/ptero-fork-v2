import { defineTheme, lazyView } from '@pterodactyl/sdk/theme';
import { skins } from './skins';
import AppLayout from './views/AppLayout';
import { AccountLayout, AdminLayout, ServerLayout } from './views/AreaLayouts';
import PageFooter from './views/PageFooter';
import AuthLayout from './views/Auth/Layout';
import Login from './views/Auth/Login';
import Checkpoint from './views/Auth/Checkpoint';
import Forgot from './views/Auth/Forgot';
import Reset from './views/Auth/Reset';
import Suspended from './views/Auth/Suspended';
import ConsolePage from './views/Server/Console';
import Power from './views/Server/Power';
import Terminal from './views/Server/Terminal';
import Stats from './views/Server/Stats';

/**
 * Skins for the UI kit and views by name. `npx pterodactyl-theme list` lists every view, and
 * `npx pterodactyl-theme eject <view>` copies classic's source for one into src/views. Wrap pages
 * and blocks in lazyView(() => import('./views/…')) so they load when first shown.
 */
export default defineTheme({
    ui: { ...skins, PageFooter },
    views: {
        'layout.app': AppLayout,
        // Each area's pages sit under the rail, which lists their navigation.
        'layout.server': ServerLayout,
        'layout.account': AccountLayout,
        'layout.admin': AdminLayout,
        'layout.auth': AuthLayout,
        // The page after sign-in, and the list of services it is built around.
        'page.dashboard': lazyView(() => import('./views/Overview/Dashboard')),
        'dashboard.serverList': lazyView(() => import('./views/Overview/ServerList')),
        'dashboard.serverCard': lazyView(() => import('./views/Overview/ServerCard')),
        'dashboard.serverCard.identity': lazyView(() => import('./views/Overview/ServerCardIdentity')),
        'dashboard.serverCard.address': lazyView(() => import('./views/Overview/ServerCardAddress')),
        'dashboard.serverCard.metrics': lazyView(() => import('./views/Overview/ServerCardMetrics')),
        'page.auth.login': Login,
        'page.auth.checkpoint': Checkpoint,
        'page.auth.password': Forgot,
        'page.auth.passwordReset': Reset,
        'page.auth.suspended': Suspended,
        'page.server.console': ConsolePage,
        'server.power': Power,
        'server.terminal': Terminal,
        'server.stats': Stats,
        // The file browser's pieces, so an extension can still replace one of them.
        'server.files.details': lazyView(() => import('./views/Server/Files/Details')),
        'server.files.manager.toolbar': lazyView(() => import('./views/Server/Files/Toolbar')),
        'server.files.manager.list': lazyView(() => import('./views/Server/Files/List')),
        'server.files.manager.selection': lazyView(() => import('./views/Server/Files/Selection')),
        'page.server.files.editor': lazyView(() => import('./views/Server/Files/EditorPage')),
        'server.files.editor': lazyView(() => import('./views/Server/Files/Editor')),
        'server.files.editor.notice': lazyView(() => import('./views/Server/Files/EditorNotice')),
        'server.files.editor.canvas': lazyView(() => import('./views/Server/Files/EditorCanvas')),
        'server.files.editor.language': lazyView(() => import('./views/Server/Files/EditorLanguage')),
        'server.files.editor.actions': lazyView(() => import('./views/Server/Files/EditorActions')),
    },
});
