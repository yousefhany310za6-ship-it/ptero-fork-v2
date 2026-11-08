import { Paintbrush } from 'lucide-react';
import { SettingsPage } from '../kit/settings/SettingsPage';

/** Admin > Branding: every setting on one page (the Extensions page's Settings button opens it too). */
export default function SettingsScreen() {
    return <SettingsPage extension='branding' title='Branding' description='Your logo, collapsed logo and favicon, how they show and how big.' icon={<Paintbrush size={22} aria-hidden />} />;
}
