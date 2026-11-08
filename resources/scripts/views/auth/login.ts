import { useCallback, useState } from 'react';
import { useField, useForm, useStore } from '@tanstack/react-form';
import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { useLogin, useLoginCheckpoint } from '@/api/auth/queries';
import {
    parseSuspensionNotice,
    readSuspensionNotice,
    type SuspensionHistoryState,
    type SuspensionNotice,
} from '@/api/auth/suspension';
import { isString } from '@/lib/objects';
import { parseRedirectSearch } from '@/router/redirect';
import { useRouteSlotData } from '@/router/routeSlots';
import { useOpenLoginCheckpoint } from '@/sdk/navigation';
import { boundField, fixtureField } from '../forms';
import { implementViews } from '../registry';
import { useCaptcha } from './captcha';
import type { CheckpointFormModel, LoginFormModel, SuspendedAccountModel } from './types';

const required = (message: string) => ({
    onChange: ({ value }: { value: string }) => (value.length >= 1 ? undefined : message),
});

/**
 * Carries the refusal to the screen that explains it, in history state and over the login form
 * themselves. The notice is never in the address: it describes one account to whoever reads it,
 * and only the person who just proved the password should be reading it.
 */
function useOpenSuspendedAccount(): (suspension: SuspensionNotice) => Promise<void> {
    const navigate = useNavigate();

    return useCallback(
        (suspension: SuspensionNotice) =>
            navigate({ to: '/auth/suspended', replace: true, state: { suspension } as never }),
        [navigate]
    );
}

function useLoginFormModel(): LoginFormModel {
    const { redirect } = parseRedirectSearch(useSearch({ strict: false }));
    const openCheckpoint = useOpenLoginCheckpoint();
    const openSuspension = useOpenSuspendedAccount();
    const route = useRouteSlotData();
    const login = useLogin();
    const { Captcha, token, tokenField } = useCaptcha('auth.login');
    const form = useForm({
        defaultValues: { username: '', password: '' },
        onSubmit: async ({ value }) => {
            const captcha = await token();

            if (captcha === null) {
                return;
            }

            try {
                const response = await login.mutateAsync({
                    body: { user: value.username, password: value.password, [tokenField]: captcha },
                });

                if (response.data.complete) {
                    window.location.assign(redirect || response.data.intended || '/');

                    return;
                }

                void openCheckpoint(response.data.confirmation_token);
            } catch (error) {
                // A closed account is owed more than the sentence in a toast: the reference to
                // quote, the message written for it, and the way to reach support belong on a
                // page the account holder can read at their own pace.
                const suspension = parseSuspensionNotice(error);

                if (suspension !== null) {
                    void openSuspension(suspension);

                    return;
                }

                // Error toast is handled by the mutation.
            }
        },
    });
    const username = useField({
        form,
        name: 'username',
        validators: required('A username or email must be provided.'),
    });
    const password = useField({ form, name: 'password', validators: required('Please enter your account password.') });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting) || login.isPending;

    return {
        fields: {
            username: boundField(username, { type: 'text', autoComplete: 'username', disabled: submitting }),
            password: boundField(password, {
                type: 'password',
                autoComplete: 'current-password',
                disabled: submitting,
            }),
        },
        submit: () => void form.handleSubmit(),
        canSubmit,
        submitting,
        Captcha,
        forgotPassword: { to: '/auth/password' },
        route,
    };
}

function useCheckpointFormModel(): CheckpointFormModel {
    // The login form hands over the confirmation token in history state; the route requires it.
    const state = useLocation().state;
    const token = 'token' in state && isString(state.token) ? state.token : '';
    const { redirect } = parseRedirectSearch(useSearch({ strict: false }));
    const openSuspension = useOpenSuspendedAccount();
    const checkpoint = useLoginCheckpoint();
    const [recovery, setRecovery] = useState(false);
    const form = useForm({
        defaultValues: { code: '', recoveryCode: '' },
        onSubmit: async ({ value }) => {
            try {
                const response = await checkpoint.mutateAsync({
                    body: {
                        confirmation_token: token,
                        authentication_code: value.code,
                        recovery_token: value.recoveryCode || undefined,
                    },
                });

                if (response.data.complete) {
                    window.location.assign(redirect || response.data.intended || '/');
                }
            } catch (error) {
                // A suspension that landed while the code was being typed answers the same way.
                const suspension = parseSuspensionNotice(error);

                if (suspension !== null) {
                    void openSuspension(suspension);

                    return;
                }

                // Error toast is handled by the mutation.
            }
        },
    });
    const code = useField({ form, name: 'code' });
    const recoveryCode = useField({ form, name: 'recoveryCode' });
    const canSubmit = useStore(form.store, (state) => state.canSubmit);
    const submitting = useStore(form.store, (state) => state.isSubmitting);

    return {
        fields: { code: boundField(recovery ? recoveryCode : code, { type: 'text', autoComplete: 'one-time-code' }) },
        submit: () => void form.handleSubmit(),
        canSubmit,
        submitting,
        recovery,
        toggleRecovery: () => {
            form.setFieldValue('code', '');
            form.setFieldValue('recoveryCode', '');
            setRecovery((current) => !current);
        },
        login: { to: '/auth/login', search: { redirect } },
    };
}

function useSuspendedAccountModel(): SuspendedAccountModel {
    // The route refuses to render this page without a notice: see the `beforeLoad` on `/auth/suspended`.
    // Everything it holds came from the panel's own refusal of this sign-in, so there is nothing to
    // fetch here — and nothing to show to whoever reaches the address without having been refused.
    const state = useLocation().state;
    const notice = readSuspensionNotice(state as SuspensionHistoryState);

    return {
        caseId: notice?.caseId ?? '',
        message: notice?.message ?? null,
        permanent: notice?.permanent ?? false,
        expiresAt: notice?.expiresAt ?? null,
        support: notice?.support ?? { email: null, discordUrl: null },
        login: { to: '/auth/login' },
    };
}

const noop = () => {};

const route = { pathname: '/auth/login', search: {}, params: {} };

function loginFixture(
    values: { username: string; password: string } = { username: '', password: '' },
    overrides: Partial<LoginFormModel> = {}
): LoginFormModel {
    const disabled = overrides.submitting ?? false;

    return {
        fields: {
            username: fixtureField('username', { type: 'text', autoComplete: 'username', disabled }, values.username),
            password: fixtureField(
                'password',
                { type: 'password', autoComplete: 'current-password', disabled },
                values.password
            ),
        },
        submit: noop,
        canSubmit: true,
        submitting: false,
        Captcha: null,
        forgotPassword: { to: '/auth/password' },
        route,
        ...overrides,
    };
}

const checkpointFixture = (recovery: boolean): CheckpointFormModel => ({
    fields: { code: fixtureField(recovery ? 'recoveryCode' : 'code', { type: 'text', autoComplete: 'one-time-code' }) },
    submit: noop,
    canSubmit: true,
    submitting: false,
    recovery,
    toggleRecovery: noop,
    login: { to: '/auth/login', search: {} },
});

function suspendedFixture(overrides: Partial<SuspendedAccountModel> = {}): SuspendedAccountModel {
    return {
        caseId: 'A7K2P9',
        message: 'Reports of abuse against this account were confirmed while they were reviewed.',
        permanent: false,
        expiresAt: '2026-11-20T00:00:00+00:00',
        support: { email: 'help@example.com', discordUrl: 'https://discord.gg/example' },
        login: { to: '/auth/login' },
        ...overrides,
    };
}

implementViews({
    'page.auth.login': {
        use: useLoginFormModel,
        fixtures: {
            default: () => loginFixture(),
            invalid: () => {
                const model = loginFixture();

                return {
                    ...model,
                    fields: {
                        username: { ...model.fields.username, error: 'A username or email must be provided.' },
                        password: { ...model.fields.password, error: 'Please enter your account password.' },
                    },
                    canSubmit: false,
                };
            },
            submitting: () => loginFixture({ username: 'alex', password: 'correct horse' }, { submitting: true }),
        },
    },
    'page.auth.checkpoint': {
        use: useCheckpointFormModel,
        fixtures: { code: () => checkpointFixture(false), recovery: () => checkpointFixture(true) },
    },
    'page.auth.suspended': {
        use: useSuspendedAccountModel,
        fixtures: {
            temporary: () => suspendedFixture(),
            permanent: () => suspendedFixture({ permanent: true, expiresAt: null }),
            // A panel that never configured a support address, and a closure nobody wrote a
            // message for: the reference is the one thing always worth showing.
            bare: () => suspendedFixture({ message: null, support: { email: null, discordUrl: null } }),
        },
    },
});
