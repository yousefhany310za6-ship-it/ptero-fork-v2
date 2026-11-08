import { createElement, useCallback, useMemo, useRef, type ComponentType, type RefObject } from 'react';
import { toast } from 'sonner';
import { useSiteSettings } from '@/api/settings/queries';
import type { CaptchaWidgetSettings } from '@/api/settings/types';
import CaptchaWidget, { type CaptchaWidgetHandle } from '@/components/elements/CaptchaWidget';

function widgetLeaf(ref: RefObject<CaptchaWidgetHandle | null>, settings: CaptchaWidgetSettings): ComponentType {
    return function Captcha() {
        return createElement(CaptchaWidget, {
            ref,
            provider: settings.provider,
            siteKey: settings.siteKey,
            scriptUrl: settings.scriptUrl,
        });
    };
}

/** The captcha of an action, in whatever provider the panel has assigned to it. */
interface AuthCaptcha {
    readonly Captcha: ComponentType | null;
    /** The value to send, or null once the user has been told the verification failed. */
    readonly token: () => Promise<string | null>;
    /** The field the token must be sent under; a different provider's field is refused, not tried. */
    readonly tokenField: string;
}

export function useCaptcha(action?: string): AuthCaptcha {
    const ref = useRef<CaptchaWidgetHandle>(null);
    const { captcha } = useSiteSettings();
    const settings = useMemo<CaptchaWidgetSettings>(
        () => (action ? (captcha.actions[action] ?? captcha) : captcha),
        [action, captcha]
    );
    const enabled = captcha.enabled && settings.provider !== null;
    const tokenField = settings.tokenField ?? 'g-recaptcha-response';

    const Captcha = useMemo(() => (enabled ? widgetLeaf(ref, settings) : null), [enabled, settings]);

    const token = useCallback(async () => {
        if (!enabled) {
            return '';
        }

        const value = (await ref.current?.execute()) ?? '';

        if (!value) {
            toast.error('Captcha verification failed, please try again.');

            return null;
        }

        return value;
    }, [enabled]);

    return { Captcha, token, tokenField };
}
