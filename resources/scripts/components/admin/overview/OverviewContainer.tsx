import { Link, type LinkProps } from '@tanstack/react-router';
import { useAdminVersion } from '@/api/admin/version/queries';
import AdminContentBlock from '@/components/admin/AdminContentBlock';
import OverviewVersionCard from '@/components/admin/overview/OverviewVersionCard';
import Spinner from '@/components/elements/Spinner';
import { httpErrorToHuman } from '@/api/http';
import { ServerError } from '@/components/elements/ScreenBlock';
import Slot from '@/extensions/Slot';
import { interactiveSurfaceClass } from '@/components/ui/styles';
import { cn } from '@/lib/cn';

const sections: { to: LinkProps['to']; label: string; description: string }[] = [
    { to: '/panel/users', label: 'Users', description: 'Create, edit, and remove user accounts.' },
    { to: '/panel/locations', label: 'Locations', description: 'Group nodes into physical locations.' },
    { to: '/panel/nodes', label: 'Nodes', description: 'Manage Wings daemons and allocations.' },
    { to: '/panel/servers', label: 'Servers', description: 'Provision and manage game servers.' },
    { to: '/panel/databases', label: 'Database Hosts', description: 'Configure MySQL hosts for server databases.' },
    { to: '/panel/mounts', label: 'Mounts', description: 'Define host → container mount points.' },
    { to: '/panel/eggs', label: 'Eggs', description: 'Manage server templates and variables.' },
    { to: '/panel/settings', label: 'Settings', description: 'General, mail, and advanced configuration.' },
    { to: '/panel/api', label: 'API Keys', description: 'Issue application API credentials.' },
];

export default function OverviewContainer() {
    const { data: version, error, refetch } = useAdminVersion();

    if (error && !version) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => refetch()} />;
    }

    return (
        <AdminContentBlock
            title='Admin Overview'
            heading='Administration'
            description='Manage your users, infrastructure, servers, and panel settings.'
        >
            <Slot name='panel.overview.before' />
            {version ? <OverviewVersionCard version={version} /> : <Spinner size='large' centered />}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {sections.map((s) => (
                    <Link
                        key={s.to}
                        to={s.to}
                        className={cn(
                            'block rounded-sm border border-transparent bg-card p-5 no-underline',
                            interactiveSurfaceClass
                        )}
                    >
                        <p className='text-foreground font-medium'>{s.label}</p>
                        <p className='text-muted-foreground text-sm mt-1'>{s.description}</p>
                    </Link>
                ))}
            </div>
            <Slot name='panel.overview.after' />
        </AdminContentBlock>
    );
}
