// Generated from kit/settings/SettingsLink.tsx by scripts/kit.mjs for branding. Do not edit here.
import { useEffect } from 'react';
import { usePanelNavigate } from '@pterodactyl/sdk';

/**
 * On Admin > Extensions, this extension's Settings button opens its own settings page instead of the panel's small
 * dialog. The panel draws that button, so a click on it is caught here first. The card is found by the extension id
 * the panel prints on it, and the button by its settings icon, so a translated label does not matter.
 */
export function settingsLink(extension: string, screen: string) {
    return function SettingsLink() {
        const navigate = usePanelNavigate();
        useEffect(() => {
            const onClick = (event: MouseEvent) => {
                const button = (event.target as Element | null)?.closest('article button');
                const card = button?.closest('article');
                if (!button || !card) return;
                const id = [...card.querySelectorAll('p .font-mono, p span')].map((e) => e.textContent?.trim()).find((t) => t === extension);
                if (!id || !button.querySelector('svg[class*="settings"]')) return;
                event.preventDefault();
                event.stopPropagation();
                void navigate({ extension, screen } as never);
            };
            document.addEventListener('click', onClick, true);
            return () => document.removeEventListener('click', onClick, true);
        }, [navigate]);
        return null;
    };
}
