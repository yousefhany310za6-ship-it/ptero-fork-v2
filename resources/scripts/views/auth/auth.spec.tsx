/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useImperativeHandle, type Ref } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider,
} from '@tanstack/react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/api/queryClient';
import { siteSettingsQueryKey } from '@/api/settings/queries';
import { renderView } from '@/sdk/testing';
import { View } from '../View';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
    checkpoint: vi.fn(),
    requestReset: vi.fn(),
    reset: vi.fn(),
    execute: vi.fn<() => Promise<string | null>>(),
    copy: vi.fn<(text: string) => Promise<boolean>>(),
}));

vi.mock('@/api/auth/queries', () => ({
    useLogin: () => ({ mutateAsync: mocks.login, isPending: false }),
    useLoginCheckpoint: () => ({ mutateAsync: mocks.checkpoint, isPending: false }),
    useRequestPasswordResetEmail: () => ({ mutateAsync: mocks.requestReset, isPending: false }),
    usePerformPasswordReset: () => ({ mutateAsync: mocks.reset, isPending: false }),
}));

vi.mock('@/lib/clipboard', () => ({ default: mocks.copy }));

vi.mock('@/components/elements/InvisibleRecaptcha', () => ({
    default: function InvisibleRecaptcha({ ref }: { ref: Ref<{ execute: () => Promise<string | null> }> }) {
        useImperativeHandle(ref, () => ({ execute: mocks.execute }));

        return <div data-testid='recaptcha' />;
    },
}));

const views = {
    '/auth/login': 'page.auth.login',
    '/auth/login/checkpoint': 'page.auth.checkpoint',
    '/auth/suspended': 'page.auth.suspended',
    '/auth/password': 'page.auth.password',
    '/auth/password/reset/$token': 'page.auth.passwordReset',
} as const;

/** The 403 a suspended account is answered with, exactly as `AccountSuspendedException` sends it. */
const suspensionRefusal = () =>
    new AxiosError('Request failed with status code 403', '403', undefined, undefined, {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
            errors: [
                {
                    code: 'AccountSuspendedException',
                    status: '403',
                    detail: 'This account is suspended. Quote support case A7K2P9 when contacting support.',
                    meta: {
                        support_case_id: 'A7K2P9',
                        message: 'Reports of abuse against this account were confirmed while they were reviewed.',
                        is_permanent: false,
                        expires_at: '2026-11-20T00:00:00+00:00',
                        support: { email: 'help@example.com', discord_url: 'https://discord.gg/example' },
                    },
                },
            ],
        },
    });

/** Any other refusal, which the form is to leave on the toast and nowhere else. */
const wrongPassword = () =>
    new AxiosError('Request failed with status code 400', '400', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { errors: [{ code: 'DisplayException', status: '400', detail: 'Password fields cannot be blank.' }] },
    });

let router: ReturnType<typeof createAuthRouter> | undefined;

function createAuthRouter(path: string) {
    const root = createRootRoute({ component: Outlet });

    return createRouter({
        routeTree: root.addChildren(
            Object.entries(views).map(([route, name]) =>
                createRoute({ getParentRoute: () => root, path: route, component: () => <View name={name} /> })
            )
        ),
        history: createMemoryHistory({ initialEntries: [path] }),
    });
}

async function renderAuth(path: string, recaptcha = false) {
    queryClient.setQueryData(siteSettingsQueryKey, {
        name: 'Panel',
        locale: 'en',
        recaptcha: { enabled: recaptcha, siteKey: recaptcha ? 'site-key' : '' },
        captcha: {
            enabled: recaptcha,
            provider: recaptcha ? 'recaptcha' : null,
            siteKey: recaptcha ? 'site-key' : null,
            scriptUrl: recaptcha ? 'https://www.google.com/recaptcha/api.js' : null,
            tokenField: 'g-recaptcha-response',
            actions: {},
        },
    });
    router = createAuthRouter(path);

    await act(async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router!} />
            </QueryClientProvider>
        );
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.copy.mockResolvedValue(true);
});

afterEach(() => {
    cleanup();
    queryClient.clear();
    router = undefined;
});

describe('auth views from fixtures', () => {
    it('shows field errors and the disabled state a fixture describes', () => {
        const { container, unmount } = renderView('page.auth.login', { fixture: 'submitting' });

        expect(container.querySelector('input[name="username"]')).toBeDisabled();
        expect(container.querySelector('button[type="submit"]')).toHaveAttribute('aria-busy', 'true');
        unmount();

        const invalid = renderView('page.auth.login', { fixture: 'invalid' });

        expect(invalid.container).toHaveTextContent('A username or email must be provided.');
        expect(invalid.container.querySelector('input[name="password"]')).toHaveAttribute('aria-invalid', 'true');
        invalid.unmount();
    });

    it('mounts the extensions of the login form slot with the route', () => {
        const { container, unmount } = renderView('page.auth.login', {
            slots: { 'auth.login.form.after': ({ data }) => <p>Signing in at {data.pathname}</p> },
        });

        expect(container).toHaveTextContent('Signing in at /auth/login');
        unmount();
    });

    it('gives a suspended account its reference, its message and the way to support', () => {
        const { container, unmount } = renderView('page.auth.suspended', { fixture: 'temporary' });

        expect(container).toHaveTextContent('A7K2P9');
        expect(container).toHaveTextContent('Reports of abuse against this account were confirmed');
        expect(container).toHaveTextContent('help@example.com');
        expect(container.querySelector('a[href="https://discord.gg/example"]')).toBeInTheDocument();
        unmount();

        const permanent = renderView('page.auth.suspended', { fixture: 'permanent' });

        expect(permanent.container).toHaveTextContent('This suspension is permanent.');
        expect(permanent.container).not.toHaveTextContent('runs until');
        permanent.unmount();

        // Nothing invented: a panel that never named a support address says so rather than guessing one.
        const bare = renderView('page.auth.suspended', { fixture: 'bare' });

        expect(bare.container).toHaveTextContent('This panel has not published a support contact.');
        expect(bare.container).not.toHaveTextContent('help@example.com');
        bare.unmount();
    });
});

describe('page.auth.login', () => {
    it('gives password managers the attributes they read', async () => {
        await renderAuth('/auth/login');

        const username = screen.getByLabelText('Username or Email');
        const password = screen.getByLabelText('Password');

        expect(username).toHaveAttribute('name', 'username');
        expect(username).toHaveAttribute('autocomplete', 'username');
        expect(password).toHaveAttribute('type', 'password');
        expect(password).toHaveAttribute('autocomplete', 'current-password');
        expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/auth/password');
    });

    it('hands a two-factor login to the checkpoint with its token and destination', async () => {
        mocks.login.mockResolvedValue({ data: { complete: false, confirmation_token: 'confirm-token' } });
        await renderAuth('/auth/login?redirect=%2Fpanel%2Fnodes');

        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Login' }));
        });

        await waitFor(() => expect(router!.state.location.pathname).toBe('/auth/login/checkpoint'));
        expect(mocks.login).toHaveBeenCalledWith({
            body: { user: 'alex', password: 'correct horse', 'g-recaptcha-response': '' },
        });
        expect(router!.state.location.search).toEqual({ redirect: '/panel/nodes' });
        expect(router!.state.location.state).toMatchObject({ token: 'confirm-token' });
    });

    it('validates before submitting', async () => {
        await renderAuth('/auth/login');

        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: '' } });

        expect(await screen.findByText('A username or email must be provided.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Login' })).toBeDisabled();
        expect(mocks.login).not.toHaveBeenCalled();
    });

    it('sends the reCAPTCHA token, and stops when verification fails', async () => {
        const error = vi.spyOn(toast, 'error').mockImplementation(() => '');

        mocks.login.mockReturnValue(new Promise(() => {}));
        await renderAuth('/auth/login', true);

        expect(screen.getByTestId('recaptcha')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });

        mocks.execute.mockResolvedValueOnce(null);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Login' }));
        });

        expect(error).toHaveBeenCalledWith('Captcha verification failed, please try again.');
        expect(mocks.login).not.toHaveBeenCalled();

        mocks.execute.mockResolvedValueOnce('captcha-token');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Login' }));
        });

        expect(mocks.login).toHaveBeenCalledWith({
            body: { user: 'alex', password: 'secret', 'g-recaptcha-response': 'captcha-token' },
        });
    });
});

describe('page.auth.checkpoint', () => {
    it('switches to a recovery code and sends it with the confirmation token', async () => {
        mocks.checkpoint.mockResolvedValue({ data: { complete: false } });
        await renderAuth('/auth/login');
        await act(() => router!.navigate({ to: '/auth/login/checkpoint', state: { token: 'confirm-token' } }));

        const code = screen.getByTitle('Authentication Code');

        expect(code).toHaveAttribute('autocomplete', 'one-time-code');
        fireEvent.click(screen.getByRole('button', { name: "I've Lost My Device" }));

        const recovery = screen.getByTitle('Recovery Code');

        expect(recovery).toHaveAttribute('name', 'recoveryCode');
        fireEvent.change(recovery, { target: { value: 'abcd-efgh' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        });

        expect(mocks.checkpoint).toHaveBeenCalledWith({
            body: { confirmation_token: 'confirm-token', authentication_code: '', recovery_token: 'abcd-efgh' },
        });
    });
});

async function signIn() {
    fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'alex' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    });
}

describe('page.auth.suspended', () => {
    it('carries a refused sign-in to the page that explains it', async () => {
        mocks.login.mockRejectedValue(suspensionRefusal());
        await renderAuth('/auth/login');
        await signIn();

        await waitFor(() => expect(router!.state.location.pathname).toBe('/auth/suspended'));
        expect(router!.state.location.state).toMatchObject({
            suspension: { caseId: 'A7K2P9', permanent: false, support: { email: 'help@example.com' } },
        });
        expect(await screen.findByText('A7K2P9')).toBeVisible();
        expect(
            screen.getByText('Reports of abuse against this account were confirmed while they were reviewed.')
        ).toBeVisible();
    });

    it('copies the reference the account has to quote', async () => {
        mocks.login.mockRejectedValue(suspensionRefusal());
        await renderAuth('/auth/login');
        await signIn();

        await act(async () => {
            fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
        });

        expect(mocks.copy).toHaveBeenCalledWith('A7K2P9');
    });

    it('answers a checkpoint the same way when the account closes underneath it', async () => {
        mocks.checkpoint.mockRejectedValue(suspensionRefusal());
        await renderAuth('/auth/login');
        await act(() => router!.navigate({ to: '/auth/login/checkpoint', state: { token: 'confirm-token' } }));

        fireEvent.change(screen.getByTitle('Authentication Code'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        });

        await waitFor(() => expect(router!.state.location.pathname).toBe('/auth/suspended'));
        expect(await screen.findByText('A7K2P9')).toBeVisible();
    });

    it('leaves any other refusal on the form, where the toast already says why', async () => {
        mocks.login.mockRejectedValue(wrongPassword());
        await renderAuth('/auth/login');
        await signIn();

        await waitFor(() => expect(mocks.login).toHaveBeenCalled());
        expect(router!.state.location.pathname).toBe('/auth/login');
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });
});

describe('password reset forms', () => {
    it('requests a reset email and clears the form', async () => {
        mocks.requestReset.mockResolvedValue({});
        await renderAuth('/auth/password');

        const email = screen.getByLabelText('Email');

        expect(email).toHaveAttribute('autocomplete', 'email');
        fireEvent.change(email, { target: { value: 'alex@example.test' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Send Email' }));
        });

        expect(mocks.requestReset).toHaveBeenCalledWith({
            body: { email: 'alex@example.test', 'g-recaptcha-response': '' },
        });
        expect(email).toHaveValue('');
    });

    it('resets with the token and email from the link once the passwords match', async () => {
        mocks.reset.mockReturnValue(new Promise(() => {}));
        await renderAuth('/auth/password/reset/reset-token?email=alex%40example.test');

        expect(screen.getByLabelText('Email')).toHaveValue('alex@example.test');
        fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'correct horse' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'correct' } });

        expect(await screen.findByText('Your new password does not match.')).toBeVisible();
        expect(screen.getByLabelText('New Password')).toHaveAttribute('autocomplete', 'new-password');

        fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'correct horse' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));
        });

        expect(mocks.reset).toHaveBeenCalledWith({
            body: {
                email: 'alex@example.test',
                token: 'reset-token',
                password: 'correct horse',
                password_confirmation: 'correct horse',
                'g-recaptcha-response': '',
            },
        });
    });
});
