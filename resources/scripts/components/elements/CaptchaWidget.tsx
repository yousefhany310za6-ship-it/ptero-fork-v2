import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import InvisibleRecaptcha, { type InvisibleRecaptchaHandle } from '@/components/elements/InvisibleRecaptcha';

export interface CaptchaWidgetHandle {
    /** Solves the challenge if one is needed and returns the token, or null. Never rejects. */
    execute: () => Promise<string | null>;
}

export interface ProviderApi {
    render: (element: HTMLElement, options: Record<string, string>) => string;
    // Both providers answer execute() with a promise; awaiting anything else still finds a token
    // through getResponse(), which is why the fallback below does not care which it was.
    execute: (widgetId: string) => Promise<string | null>;
    getResponse?: (widgetId?: string) => string | null;
    reset?: (widgetId: string) => void;
    remove?: (widgetId: string) => void;
}

/**
 * The API a provider's script installs on the window under its own name. Only the providers listed
 * by MANAGED_PROVIDERS appear here; reCAPTCHA is rendered by its own component.
 */
declare global {
    interface Window {
        hcaptcha?: ProviderApi;
        turnstile?: ProviderApi;
    }
}

/** The providers this widget renders itself, each named exactly as its script names its API. */
const MANAGED_PROVIDERS = ['hcaptcha', 'turnstile'] as const;

type ManagedProvider = (typeof MANAGED_PROVIDERS)[number];

/** The provider this widget can serve, or null for one it has never been written against. */
const managedProvider = (provider: string): ManagedProvider | null =>
    MANAGED_PROVIDERS.find((managed) => managed === provider) ?? null;

// The same bound the invisible reCAPTCHA applies: long enough for a human to answer a challenge,
// short enough that a form is never left waiting on a script that stopped answering.
const EXECUTE_TIMEOUT_MS = 120_000;

/** One load per script, shared by every mount of the widget. */
const pendingScripts = new Map<string, Promise<ProviderApi | null>>();

function explicit(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}render=explicit`;
}

function apiFor(provider: ManagedProvider): ProviderApi | null {
    const api = window[provider];

    return api?.render ? api : null;
}

function loadProviderScript(url: string, provider: ManagedProvider): Promise<ProviderApi | null> {
    if (!url) {
        return Promise.resolve(null);
    }

    const existing = pendingScripts.get(url);

    if (existing) {
        return existing;
    }

    const loading = new Promise<ProviderApi | null>((resolve) => {
        const immediate = apiFor(provider);

        if (immediate) {
            resolve(immediate);

            return;
        }

        const script = document.createElement('script');

        script.src = explicit(url);
        script.async = true;

        // Both providers queue their API behind a ready callback; some deliver the global a beat
        // after the script's own load event, so waiting on the event alone is not enough.
        script.addEventListener('load', () => {
            let attempts = 0;

            const poll = () => {
                const api = apiFor(provider);

                if (api) {
                    resolve(api);

                    return;
                }

                if (attempts++ > 50) {
                    resolve(null);

                    return;
                }

                window.setTimeout(poll, 20);
            };

            poll();
        });

        // A failed load is removed from the map so the next attempt can try the network again.
        script.addEventListener('error', () => {
            pendingScripts.delete(url);
            resolve(null);
        });

        document.head.appendChild(script);
    });

    pendingScripts.set(url, loading);

    return loading;
}

const renderOptions = (provider: ManagedProvider, siteKey: string): Record<string, string> => {
    if (provider === 'turnstile') {
        return { sitekey: siteKey, execution: 'execute', appearance: 'interaction-only', theme: 'auto' };
    }

    // hCaptcha uses `size: 'invisible'` (not Turnstile's `execution: 'execute'`).
    return { sitekey: siteKey, size: 'invisible', theme: 'auto' };
};

interface ManagedWidgetProps {
    ref?: React.Ref<CaptchaWidgetHandle>;
    provider: ManagedProvider;
    siteKey: string;
    scriptUrl: string;
}

/**
 * hCaptcha and Cloudflare Turnstile, loaded from the provider's own script and executed on demand.
 * Rendered invisibly by default for a clean form experience; interactive challenges appear only when
 * the provider requires them.
 */
function ManagedWidget({ ref, provider, siteKey, scriptUrl }: ManagedWidgetProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<ProviderApi | null>(null);
    const widgetRef = useRef<string | null>(null);
    const [ready, setReady] = useState(false);
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        let cancelled = false;

        void loadProviderScript(scriptUrl, provider).then((api) => {
            if (cancelled || !api) {
                return;
            }

            apiRef.current = api;
            setReady(true);
        });

        return () => {
            cancelled = true;
        };
    }, [provider, scriptUrl]);

    useEffect(() => {
        const api = apiRef.current;
        const host = hostRef.current;

        if (!ready || !api || !host || !siteKey) {
            return;
        }

        const start = () => {
            try {
                widgetRef.current = api.render(host, renderOptions(provider, siteKey));
            } catch {
                widgetRef.current = null;
            }
        };

        // Turnstile refuses ready() for a script it did not see in the markup, and this one is
        // injected, so render straight away: the API global only appears once the provider can
        // answer it, and it queues a call that arrives a moment early.
        start();

        return () => {
            const id = widgetRef.current;

            widgetRef.current = null;

            if (id !== null) {
                try {
                    api.remove?.(id);
                } catch {
                    // The container has already gone.
                }
            }
        };
    }, [ready, siteKey, provider]);

    useImperativeHandle(
        ref,
        () => ({
            execute: async () => {
                const api = apiRef.current;
                const id = widgetRef.current;

                if (!api || !id) {
                    return null;
                }

                const spent = new Promise<string | null>((resolve) => {
                    window.setTimeout(() => resolve(null), EXECUTE_TIMEOUT_MS);
                });

                const answer = (async (): Promise<string | null> => {
                    setVerifying(true);
                    try {
                        return (await api.execute(id)) || api.getResponse?.(id) || null;
                    } catch {
                        return null;
                    } finally {
                        setVerifying(false);
                        // Every answer is used once, so the widget is cleared the moment it is read.
                        try {
                            api.reset?.(id);
                        } catch {
                            // Already reset by the provider.
                        }
                    }
                })();

                return Promise.race([answer, spent]);
            },
        }),
        // The handle reads only refs, which are stable; the widget's own readiness is a fact about
        // those refs at the moment it is asked, not something the handle has to be rebuilt for.
        []
    );

    if (!ready) {
        return null;
    }

    return (
        <div className='w-full'>
            <div ref={hostRef} className='flex justify-center' data-captcha-widget={provider} />
            {verifying && (
                <p className='mt-1 text-center text-xs text-muted-foreground' aria-live='polite'>
                    Verifying&hellip;
                </p>
            )}
        </div>
    );
}

interface Props {
    ref?: React.Ref<CaptchaWidgetHandle>;
    provider: string | null;
    siteKey: string | null;
    scriptUrl: string | null;
}

/** The captcha of the active provider, behind one handle whatever that provider turns out to be. */
const CaptchaWidget = ({ ref, provider, siteKey, scriptUrl }: Props) => {
    const recaptchaRef = ref as React.Ref<InvisibleRecaptchaHandle> | undefined;

    if (provider === 'recaptcha') {
        return <InvisibleRecaptcha ref={recaptchaRef} siteKey={siteKey ?? ''} />;
    }

    const managed = provider === null ? null : managedProvider(provider);

    if (!managed || !siteKey || !scriptUrl) {
        return null;
    }

    return <ManagedWidget ref={ref} provider={managed} siteKey={siteKey} scriptUrl={scriptUrl} />;
};

CaptchaWidget.displayName = 'CaptchaWidget';

export default CaptchaWidget;
