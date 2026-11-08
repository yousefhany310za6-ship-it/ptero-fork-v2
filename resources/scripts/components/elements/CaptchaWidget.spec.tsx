/** @vitest-environment jsdom */

import { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaptchaWidget, { type CaptchaWidgetHandle, type ProviderApi } from './CaptchaWidget';

const api = (overrides: Partial<ProviderApi> = {}): ProviderApi => ({
    render: vi.fn<() => string>(() => 'widget-1'),
    execute: vi.fn<() => Promise<string | null>>(() => Promise.resolve('token-1')),
    getResponse: vi.fn<() => string | null>(() => null),
    reset: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
    ...overrides,
});

let scriptCount = 0;

/** A URL of its own per mount, so one test never finds another test's load in the shared cache. */
const scriptUrl = (): string => `https://provider.test/${scriptCount++}/api.js`;

async function mount(provider: 'hcaptcha' | 'turnstile', site: ProviderApi | undefined) {
    if (site) {
        Object.defineProperty(window, provider, { value: site, configurable: true, writable: true });
    }

    const ref = createRef<CaptchaWidgetHandle>();

    await act(async () =>
        render(<CaptchaWidget ref={ref} provider={provider} siteKey='site-key' scriptUrl={scriptUrl()} />)
    );

    return ref;
}

afterEach(() => {
    cleanup();
    delete window.hcaptcha;
    delete window.turnstile;
    document.body.innerHTML = '';
});

describe('CaptchaWidget', () => {
    it('renders the sitekey it is given without waiting on a ready callback', async () => {
        // A script this widget injects is async by definition, and Turnstile throws at ready() when
        // asked to wait on one — which used to take the whole sign-in page down with it.
        const ready = vi.fn<() => void>(() => {
            throw new Error('Remove async/defer from the Turnstile api.js script tag first');
        });
        const site = Object.assign(api(), { ready });
        const ref = await mount('turnstile', site);

        expect(ready).not.toHaveBeenCalled();
        expect(site.render).toHaveBeenCalledWith(expect.any(HTMLElement), {
            sitekey: 'site-key',
            execution: 'execute',
            appearance: 'interaction-only',
            theme: 'auto',
        });
        expect(document.querySelector('[data-captcha-widget="turnstile"]')).not.toBeNull();
        expect(ref.current).not.toBeNull();
    });

    it('hands back the solved token and clears the widget, since every answer is used once', async () => {
        const site = api();
        const ref = await mount('hcaptcha', site);

        await expect(ref.current!.execute()).resolves.toBe('token-1');
        expect(site.execute).toHaveBeenCalledWith('widget-1');
        expect(site.reset).toHaveBeenCalledWith('widget-1');
    });

    it('falls back to the widget response when executing answers with nothing', async () => {
        const site = api({ execute: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)) });
        const ref = await mount('hcaptcha', site);

        await expect(ref.current!.execute()).resolves.toBeNull();

        site.getResponse = vi.fn<() => string | null>(() => 'token-2');
        await expect(ref.current!.execute()).resolves.toBe('token-2');
    });

    it('renders no widget, and no token, while its script has not answered', async () => {
        const ref = await mount('turnstile', undefined);

        expect(document.querySelector('[data-captcha-widget]')).toBeNull();
        await expect(ref.current!.execute()).resolves.toBeNull();
    });

    it('leaves the page standing when the provider refuses to render a widget', async () => {
        const site = api({
            render: vi.fn<() => string>(() => {
                throw new Error('Too many widgets');
            }),
        });
        const ref = await mount('turnstile', site);

        expect(ref.current).not.toBeNull();
        await expect(ref.current!.execute()).resolves.toBeNull();
        expect(site.reset).not.toHaveBeenCalled();
    });
});
