import { Button, PanelLink } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';
import AuthCard, { Field, authLinkClass } from '../AuthCard';

export default function Forgot({ model, className }: ViewProps<'page.auth.password'>) {
    const { Captcha } = model;

    return (
        <AuthCard title='Reset Your Password' submit={model.submit} className={className}>
            <Field
                field={model.fields.email}
                label='Email'
                description='Enter the email address on your account to receive reset instructions.'
            />
            <Button type='submit' size='xlarge' disabled={!model.canSubmit} isLoading={model.submitting}>
                Send Email
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
