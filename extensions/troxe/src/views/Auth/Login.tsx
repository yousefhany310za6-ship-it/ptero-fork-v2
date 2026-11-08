import { Button, PanelLink } from '@pterodactyl/sdk';
import { Slot, type ViewProps } from '@pterodactyl/sdk/theme';
import AuthCard, { Field, authLinkClass } from '../AuthCard';

export default function Login({ model, className }: ViewProps<'page.auth.login'>) {
    const { fields, Captcha } = model;

    return (
        <AuthCard title='Sign in to Troxe' submit={model.submit} className={className}>
            <Field field={fields.username} label='Username or Email' />
            <Field field={fields.password} label='Password' />
            <Button type='submit' size='xlarge' disabled={!model.canSubmit} isLoading={model.submitting}>
                Sign in
            </Button>
            <Slot name='auth.login.form.after' data={model.route} />
            {Captcha && <Captcha />}
            <div className='text-center'>
                <PanelLink destination={model.forgotPassword} className={authLinkClass}>
                    Forgot password?
                </PanelLink>
            </div>
        </AuthCard>
    );
}
