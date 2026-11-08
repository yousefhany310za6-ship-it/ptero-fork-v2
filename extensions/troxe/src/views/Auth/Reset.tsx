import { Button, Input, PanelLink } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import AuthCard, { Field, authLinkClass } from '../AuthCard';

export default function Reset({ model, className }: ViewProps<'page.auth.passwordReset'>) {
    const { fields, Captcha } = model;

    return (
        <AuthCard title='Choose a New Password' submit={model.submit} className={className}>
            <div>
                <label htmlFor='troxe-reset-email' className='block pb-2 fs-tiny tracking-widest uppercase'>
                    Email
                </label>
                <Input id='troxe-reset-email' value={model.email} $isLight disabled />
            </div>
            <Field field={fields.password} label='New Password' description='At least 8 characters.' />
            <Field field={fields.passwordConfirmation} label='Confirm New Password' />
            <Button type='submit' size='xlarge' disabled={!model.canSubmit} isLoading={model.submitting}>
                Reset Password
            </Button>
            {Captcha && <Captcha />}
            <div className='text-center'>
                <PanelLink destination={model.login} className={authLinkClass}>
                    Back to sign in
                </PanelLink>
            </div>
        </AuthCard>
    );
}
