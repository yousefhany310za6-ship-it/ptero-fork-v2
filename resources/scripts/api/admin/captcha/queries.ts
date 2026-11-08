import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
    adminGetCaptchaSettingsOptions,
    adminGetCaptchaSettingsQueryKey,
    adminTestACaptchaProviderMutation,
    adminUpdateCaptchaSettingsMutation,
} from '@/api/generated/@tanstack/react-query.gen';
import type {
    AdminGetCaptchaSettingsResponses,
    AdminTestACaptchaProviderData,
    AdminTestACaptchaProviderResponses,
    AdminUpdateCaptchaSettingsData,
    Options,
} from '@/api/generated';
import { notifyHttpError } from '@/plugins/notifications';

/**
 * The captcha page speaks the generated contract: what the panel answers is completed into whole
 * values here, and what the form holds is turned back into the body the endpoint validates. Neither
 * direction retypes a provider or a verb the documentation does not already list.
 */

type CaptchaSettingsResponse = AdminGetCaptchaSettingsResponses[200];
type CaptchaTestResponse = AdminTestACaptchaProviderResponses[200];
type CaptchaSettingsBody = AdminUpdateCaptchaSettingsData['body'];
type CaptchaProviderSave = CaptchaSettingsBody['providers'][number];
type CaptchaRuleSave = CaptchaSettingsBody['rules'][number];
type CaptchaProviderSetting = NonNullable<CaptchaSettingsResponse['providers']>[number];
type CaptchaRuleSetting = NonNullable<CaptchaSettingsResponse['rules']>[number];

/** A provider key the settings endpoint takes, read from the documented enum rather than retyped. */
export type CaptchaProviderName = CaptchaProviderSave['name'];

/** A verb a rule can guard. */
export type CaptchaMethod = CaptchaRuleSave['methods'][number];

/** How the screen names a provider: one of the panel's own, or nothing, which means the default. */
export type CaptchaProviderSelection = CaptchaProviderName | '';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const isCaptchaMethod = (method: string): method is CaptchaMethod =>
    HTTP_METHODS.some((known: string) => known === method);

/** A rule that was left without a verb still guards the request an action makes. */
const DEFAULT_METHODS: CaptchaMethod[] = ['POST'];

export interface CaptchaProviderState {
    name: CaptchaProviderName;
    label: string;
    enabled: boolean;
    site_key: string;
    /** A stored secret is never read back; the page only learns that one exists. */
    has_secret: boolean;
    using_shipped_keys: boolean;
    errors: string[];
}

export interface CaptchaRuleState {
    key: string;
    label: string;
    path: string | null;
    route: string | null;
    methods: CaptchaMethod[];
    provider: CaptchaProviderName | null;
    required: boolean;
    action: string | null;
    require_action: boolean;
    hostname_check: boolean | null;
    wired: boolean;
    enforced: boolean;
    /** An action the panel ships with: it always comes back, so its endpoint is not editable. */
    builtin: boolean;
}

export interface AdminCaptchaSettings {
    enabled: boolean;
    default_provider: CaptchaProviderName;
    providers: CaptchaProviderState[];
    rules: CaptchaRuleState[];
}

export type CaptchaProviderTestStatus = CaptchaTestResponse['status'];

export interface CaptchaProviderTestResult {
    provider: string;
    status: CaptchaProviderTestStatus;
    error_codes: string[];
    details: string[];
}

const providerState = (provider: CaptchaProviderSetting): CaptchaProviderState => ({
    name: provider.name,
    label: provider.label ?? provider.name,
    enabled: provider.enabled ?? false,
    site_key: provider.site_key ?? '',
    has_secret: provider.has_secret ?? false,
    using_shipped_keys: provider.using_shipped_keys ?? false,
    errors: provider.errors ?? [],
});

type CaptchaRuleEndpoint = Pick<CaptchaRuleState, 'path' | 'route' | 'methods'>;
type CaptchaRuleChecks = Pick<
    CaptchaRuleState,
    'provider' | 'required' | 'action' | 'require_action' | 'hostname_check' | 'wired' | 'enforced' | 'builtin'
>;

/** Where a rule points, as the panel answered it. */
const ruleEndpoint = (rule: CaptchaRuleSetting): CaptchaRuleEndpoint => ({
    path: rule.path ?? null,
    route: rule.route ?? null,
    // A verb the panel never accepts cannot be saved back, so it is dropped rather than widened into one.
    methods: rule.methods?.filter(isCaptchaMethod) ?? [],
});

/** How strictly a rule checks the request it guards. */
const ruleChecks = (rule: CaptchaRuleSetting): CaptchaRuleChecks => ({
    provider: rule.provider ?? null,
    required: rule.required ?? true,
    action: rule.action ?? null,
    require_action: rule.require_action ?? false,
    hostname_check: rule.hostname_check ?? null,
    wired: rule.wired ?? false,
    enforced: rule.enforced ?? false,
    builtin: rule.builtin ?? false,
});

const ruleState = (rule: CaptchaRuleSetting): CaptchaRuleState => ({
    key: rule.key ?? '',
    label: rule.label ?? rule.key ?? '',
    ...ruleEndpoint(rule),
    ...ruleChecks(rule),
});

const captchaSettings = (settings: CaptchaSettingsResponse): AdminCaptchaSettings => ({
    enabled: settings.enabled ?? false,
    // The panel always answers with a provider it can save back, so the form takes it as it is.
    default_provider: settings.default_provider,
    providers: (settings.providers ?? []).map(providerState),
    // A rule the panel answered without a key cannot be shown or saved, so it is not carried in.
    rules: (settings.rules ?? []).filter((rule) => rule.key !== undefined).map(ruleState),
});

/**
 * A test answer, completed into what the page renders. Only the shape of the answer is filled in
 * here: what it means is the page's business, and a provider name comes back as it was sent.
 */
export const captchaProviderTestResult = (result: CaptchaTestResponse): CaptchaProviderTestResult => ({
    provider: result.provider ?? '',
    status: result.status,
    error_codes: result.error_codes ?? [],
    details: result.details ?? [],
});

export const useAdminCaptchaSettings = () => useQuery({ ...adminGetCaptchaSettingsOptions(), select: captchaSettings });

export const useUpdateAdminCaptchaSettings = () => {
    const queryClient = useQueryClient();

    return useMutation({
        ...adminUpdateCaptchaSettingsMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: adminGetCaptchaSettingsQueryKey() });

            toast.success('Captcha settings saved', {
                description: 'Sign-in pages pick up the new provider the next time they load.',
            });
        },
        onError: (error) => notifyHttpError(error, 'Unable to update captcha settings'),
    });
};

export const useTestCaptchaProvider = () =>
    useMutation({
        ...adminTestACaptchaProviderMutation(),
        onError: (error) => notifyHttpError(error, 'Unable to test this provider'),
    });

export interface CaptchaProviderValues {
    name: CaptchaProviderName;
    label: string;
    enabled: boolean;
    siteKey: string;
    // Blank keeps the stored secret; it is never shown, so it can only ever be replaced.
    secretKey: string;
    hasSecret: boolean;
    usingShippedKeys: boolean;
    errors: string[];
}

export interface CaptchaRuleValues {
    /** Stable for the list on screen: a saved rule is its key, an added one its own row. */
    rowId: string;
    key: string;
    /** The name the panel gives a shipped action; an added one is shown by its own key. */
    label: string;
    builtin: boolean;
    // An added action is free to point anywhere in the panel; a shipped one keeps its endpoint.
    path: string;
    route: string;
    methods: string[];
    provider: CaptchaProviderSelection;
    required: boolean;
    // '' defers to the provider's own setting.
    hostnameCheck: '' | 'true' | 'false';
    action: string;
}

export interface CaptchaFormValues {
    enabled: boolean;
    defaultProvider: CaptchaProviderSelection;
    providers: CaptchaProviderValues[];
    rules: CaptchaRuleValues[];
}

/** The endpoint a rule guards, as one line: "POST auth/login". */
export const endpointLabel = ({
    path,
    route,
    methods,
}: {
    path: string | null;
    route: string | null;
    methods: string[];
}): string => {
    const target = path ? `/${path}` : (route ?? '');

    return `${methods.join(', ')} ${target}`.trim();
};

let addedRows = 0;

/** A blank action an administrator is about to describe: nothing is enforced until it has an endpoint. */
export const newCaptchaRule = (): CaptchaRuleValues => ({
    rowId: `added-${++addedRows}`,
    key: '',
    label: '',
    builtin: false,
    path: '',
    route: '',
    methods: ['POST'],
    provider: '',
    required: true,
    hostnameCheck: '',
    action: '',
});

/** '' means the rule defers to whatever the provider itself is configured to do. */
const hostnameCheckValue = (value: boolean | null): CaptchaRuleValues['hostnameCheck'] => {
    if (value === null) {
        return '';
    }

    return value ? 'true' : 'false';
};

/** The saved state as a form understands it. */
export const captchaFormValues = (settings: AdminCaptchaSettings): CaptchaFormValues => ({
    enabled: settings.enabled,
    defaultProvider: settings.default_provider,
    providers: settings.providers.map((provider) => ({
        name: provider.name,
        label: provider.label,
        enabled: provider.enabled,
        siteKey: provider.site_key,
        secretKey: '',
        hasSecret: provider.has_secret,
        usingShippedKeys: provider.using_shipped_keys,
        errors: provider.errors,
    })),
    rules: settings.rules.map((rule) => ({
        rowId: rule.key,
        key: rule.key,
        label: rule.label,
        builtin: rule.builtin,
        path: rule.path ?? '',
        route: rule.route ?? '',
        methods: rule.methods,
        provider: rule.provider ?? '',
        required: rule.required,
        hostnameCheck: hostnameCheckValue(rule.hostname_check),
        action: rule.action ?? '',
    })),
});

/** Rules are stored without surrounding slashes, the way the shipped ones are written. */
const trimSlashes = (path: string): string | null => {
    const trimmed = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');

    return trimmed === '' ? null : trimmed;
};

/**
 * The provider half of a save. A secret left blank in the form is not sent at all, which is how the
 * panel reads "keep the one already stored" rather than "clear it".
 */
const providerSave = ({ name, enabled, siteKey, secretKey }: CaptchaProviderValues): CaptchaProviderSave => {
    const saved: CaptchaProviderSave = { name, enabled, site_key: siteKey };

    if (secretKey !== '') {
        saved.secret_key = secretKey;
    }

    return saved;
};

/**
 * One rule as the settings endpoint takes it. A shipped action keeps the endpoint the panel was written
 * with, so saving this page can never point the login check at something else; an added action is
 * described here.
 */
const ruleSave = (rule: CaptchaRuleValues, original: CaptchaRuleState | null): CaptchaRuleSave => {
    const path = trimSlashes(rule.path);
    const route = rule.route.trim() === '' ? null : rule.route.trim();
    const action = rule.action.trim();
    const sent = rule.methods.filter(isCaptchaMethod);
    const methods = sent.length > 0 ? sent : DEFAULT_METHODS;

    return {
        key: rule.key.trim(),
        path: rule.builtin ? (original?.path ?? null) : path,
        route: rule.builtin ? (original?.route ?? null) : route,
        methods: rule.builtin ? (original?.methods ?? methods) : methods,
        provider: rule.provider === '' ? null : rule.provider,
        required: rule.required,
        action: action === '' ? null : action,
        require_action: action !== '',
        hostname_check: rule.hostnameCheck === '' ? null : rule.hostnameCheck === 'true',
    };
};

/** Every rule the form holds, minus an unfinished row whose action was never named. */
const rulesSave = (rules: CaptchaRuleValues[], loaded: CaptchaRuleState[]): CaptchaRuleSave[] =>
    rules
        .filter((rule) => rule.key.trim() !== '')
        .map((rule) => ruleSave(rule, loaded.find((item) => item.key === rule.key) ?? null));

/** Form values as the API expects them; a whole list of rules replaces the stored one. */
export const updateAdminCaptchaSettingsInput = (
    values: CaptchaFormValues,
    loaded: AdminCaptchaSettings
): Options<AdminUpdateCaptchaSettingsData> => ({
    body: {
        enabled: values.enabled,
        default_provider: values.defaultProvider === '' ? loaded.default_provider : values.defaultProvider,
        providers: values.providers.map(providerSave),
        rules: rulesSave(values.rules, loaded.rules),
    },
});

export const testCaptchaProviderInput = (provider: CaptchaProviderName): Options<AdminTestACaptchaProviderData> => ({
    path: { provider },
});
