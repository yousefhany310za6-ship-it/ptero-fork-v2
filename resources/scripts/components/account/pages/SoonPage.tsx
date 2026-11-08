import { CalendarClock, CreditCard, FileText } from 'lucide-react';
import PageContentBlock from '@/components/elements/PageContentBlock';

type SoonKind = 'invoices' | 'billing';

const copy: Record<SoonKind, { title: string; description: string; icon: typeof FileText }> = {
    invoices: {
        title: 'Invoices',
        description: 'Your invoices will be available here soon.',
        icon: FileText,
    },
    billing: {
        title: 'Billing',
        description: 'Billing management will be available here soon.',
        icon: CreditCard,
    },
};

export default function SoonPage({ kind }: { kind: SoonKind }) {
    const { title, description, icon: Icon } = copy[kind];

    return (
        <PageContentBlock title={title} showFlashKey={title.toLowerCase()}>
            <div className='flex min-h-[320px] items-center justify-center px-4 py-16'>
                <div className='w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 text-center shadow-sm backdrop-blur-sm'>
                    <div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40 text-foreground'>
                        <Icon className='h-6 w-6' aria-hidden />
                    </div>
                    <p className='mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>
                        <CalendarClock className='h-3.5 w-3.5' aria-hidden />
                        Coming soon
                    </p>
                    <h1 className='mt-3 text-2xl font-semibold tracking-tight text-foreground'>{title}</h1>
                    <p className='mt-2 text-sm leading-6 text-muted-foreground'>{description}</p>
                </div>
            </div>
        </PageContentBlock>
    );
}
