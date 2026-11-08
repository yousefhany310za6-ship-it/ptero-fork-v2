import type { ReactNode } from 'react';
import { Input, Label } from '@pterodactyl/sdk';
import { Main, cn, type FieldModel } from '@pterodactyl/sdk/theme';
import { useTroxeLogo } from '../lib/logo';

export const authLinkClass =
    'fs-tiny text-ink-muted tracking-widest uppercase no-underline transition-colors hover:text-foreground';

interface FieldProps {
    field: FieldModel;
    label?: string;
    description?: string;
    autoFocus?: boolean;
}

/** Label, input and help text for one engine field. */
export function Field({ field, label, description, autoFocus }: FieldProps) {
    const id = `troxe-${field.fieldProps.name}`;

    return (
        <div>
            {label && (
                <Label htmlFor={id} isLight>
                    {label}
                </Label>
            )}
            <Input
                {...field.fieldProps}
                id={id}
                autoFocus={autoFocus}
                aria-invalid={field.error ? true : undefined}
                $hasError={!!field.error}
                $isLight
            />
            {field.error ? (
                <p className='input-help error'>{field.error}</p>
            ) : description ? (
                <p className='input-help'>{description}</p>
            ) : null}
        </div>
    );
}

interface CardProps {
    title: string;
    /** Omitted by a page with nothing to submit, such as the notice an account is refused with. */
    submit?: () => void;
    className?: string;
    children: ReactNode;
}

/** Sign-in shell: the wordmark above a Troxe card, the geometric backdrop behind both. */
export default function AuthCard({ title, submit, className, children }: CardProps) {
    const logo = useTroxeLogo();

    return (
        <div
            className={cn(
                'relative flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-4 py-12',
                className,
            )}
        >
            <div className='troxe-backdrop pointer-events-none absolute inset-0' aria-hidden />
            <Main className='relative w-full max-w-md'>
                {logo ? (
                    <img
                        src={logo}
                        alt='Troxe Hosting'
                        className='mx-auto h-14 w-auto drop-shadow-[0_0_28px_var(--brand-glow)]'
                    />
                ) : (
                    <p className='fs-display text-center font-extrabold tracking-tight text-foreground'>Troxe</p>
                )}
                {submit ? (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit();
                        }}
                        className='troxe-card troxe-glow-brand mt-8 p-6 sm:p-8'
                    >
                        <h2 className='pb-6 text-center fs-lead font-bold tracking-tight text-foreground'>{title}</h2>
                        <div className='space-y-6'>{children}</div>
                    </form>
                ) : (
                    <div className='troxe-card troxe-glow-brand mt-8 p-6 sm:p-8'>
                        <h2 className='pb-6 text-center fs-lead font-bold tracking-tight text-foreground'>{title}</h2>
                        <div className='space-y-4'>{children}</div>
                    </div>
                )}
            </Main>
            <p className='relative text-center fs-tiny text-ink-muted'>
                &copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span> Troxe Hosting
            </p>
        </div>
    );
}
