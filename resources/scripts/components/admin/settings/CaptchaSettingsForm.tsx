import { useState } from 'react';
import { useStore } from '@tanstack/react-form';
import { useAppForm, Form, type AppForm, type SelectOption } from '@/components/form';
import {
    captchaFormValues,
    captchaProviderTestResult,
    endpointLabel,
    newCaptchaRule,
    testCaptchaProviderInput,
    updateAdminCaptchaSettingsInput,
    useAdminCaptchaSettings,
    useTestCaptchaProvider,
    useUpdateAdminCaptchaSettings,
    type AdminCaptchaSettings,
    type CaptchaFormValues,
    type CaptchaProviderTestResult,
    type CaptchaRuleValues,
} from '@/api/admin/captcha/queries';
import { httpErrorToHuman } from '@/api/http';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import Button from '@/components/elements/Button';
import Spinner from '@/components/elements/Spinner';
import { Alert } from '@/components/elements/alert';
import { ServerError } from '@/components/elements/ScreenBlock';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';

const TEST_RESULTS = {
    connected: { type: 'success', message: 'The provider answered, and its keys were accepted.' },
    keys_rejected: {
        type: 'danger',
        message: 'The provider rejected these keys. Nothing verifies until they are replaced.',
    },
    misconfigured: { type: 'danger', message: 'This provider cannot be tested as it is configured.' },
    test_keys: {
        type: 'warning',
        message: 'The provider accepted a token nobody solved — those are test keys, not live ones.',
    },
    unreachable: { type: 'danger', message: 'This panel could not reach the provider.' },
} satisfies Record<CaptchaProviderTestResult['status'], { type: 'success' | 'warning' | 'danger'; message: string }>;

const HTTP_METHODS: SelectOption[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
    value: method,
    label: method,
}));

const withoutSecrets = (values: CaptchaFormValues): CaptchaFormValues => ({
    ...values,
    providers: values.providers.map((provider) => ({ ...provider, secretKey: '' })),
});

function TestResult({ result }: { result: CaptchaProviderTestResult }) {
    const copy = TEST_RESULTS[result.status];

    return (
        <Alert type={copy.type} className='mt-4 text-sm'>
            <span>
                {copy.message}
                {result.error_codes.length > 0 && (
                    <span className='block font-mono text-micro'>{result.error_codes.join(', ')}</span>
                )}
                {result.details.length > 0 && <span className='block'>{result.details.join('; ')}</span>}
            </span>
        </Alert>
    );
}

function RuleRow({
    form,
    rule,
    index,
    readOnly,
    providerOptions,
    onRemove,
}: {
    form: AppForm<CaptchaFormValues>;
    rule: CaptchaRuleValues;
    index: number;
    readOnly: boolean;
    providerOptions: SelectOption[];
    onRemove: () => void;
}) {
    return (
        <div className='rounded-xl border border-border bg-card/40 p-4'>
            <div className='flex flex-wrap items-baseline gap-2'>
                <p className='text-sm font-semibold text-foreground'>
                    {rule.builtin ? rule.label : rule.key || 'New action'}
                </p>
                {!rule.builtin && <span className='text-micro text-muted-foreground'>custom</span>}
                <p className='font-mono text-micro text-muted-foreground'>{endpointLabel(rule)}</p>
            </div>
            <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                {!rule.builtin && (
                    <>
                        <form.AppField name={`rules[${index}].key`}>
                            {(field) => (
                                <field.TextField
                                    type='text'
                                    id={`captcha_rule_${index}_key`}
                                    label='Action key'
                                    disabled={readOnly}
                                />
                            )}
                        </form.AppField>
                        <form.AppField name={`rules[${index}].path`}>
                            {(field) => (
                                <field.TextField
                                    type='text'
                                    id={`captcha_rule_${index}_path`}
                                    label='Path'
                                    description='Panel path to guard; * matches anything after.'
                                    disabled={readOnly}
                                />
                            )}
                        </form.AppField>
                        <form.AppField name={`rules[${index}].methods`}>
                            {(field) => (
                                <field.MultiSelectField
                                    id={`captcha_rule_${index}_methods`}
                                    label='Methods'
                                    options={HTTP_METHODS}
                                    disabled={readOnly}
                                />
                            )}
                        </form.AppField>
                    </>
                )}
                <form.AppField name={`rules[${index}].provider`}>
                    {(field) => (
                        <field.SelectField
                            id={`captcha_rule_${index}_provider`}
                            label='Provider'
                            options={providerOptions}
                            disabled={readOnly}
                        />
                    )}
                </form.AppField>
                <div className='flex items-end pb-1'>
                    <form.AppField name={`rules[${index}].required`}>
                        {(field) => (
                            <field.SwitchField label='Require token' disabled={readOnly} />
                        )}
                    </form.AppField>
                </div>
            </div>
            {!rule.builtin && !readOnly && (
                <div className='mt-3 flex justify-end'>
                    <Button type='button' isSecondary onClick={onRemove}>
                        Remove
                    </Button>
                </div>
            )}
        </div>
    );
}

function CaptchaForm({ settings, readOnly }: { settings: AdminCaptchaSettings; readOnly: boolean }) {
    const updateSettings = useUpdateAdminCaptchaSettings();
    const testProvider = useTestCaptchaProvider();
    const [results, setResults] = useState<Record<string, CaptchaProviderTestResult>>({});
    const [showAdvanced, setShowAdvanced] = useState(false);

    const form = useAppForm({
        defaultValues: captchaFormValues(settings),
        onSubmit: async ({ value }) => {
            if (readOnly) {
                return;
            }

            try {
                await updateSettings.mutateAsync(updateAdminCaptchaSettingsInput(value, settings));
                form.reset(withoutSecrets(value));
            } catch {
                // Error toast is handled by the mutation.
            }
        },
    });

    const providers = settings.providers;
    const providerOptions = [
        { value: '', label: 'Panel default' },
        ...providers.map((provider) => ({ value: provider.name, label: provider.label })),
    ];
    const enabled = useStore(form.store, (state) => state.values.enabled);
    const rules = useStore(form.store, (state) => state.values.rules);
    const drafts = useStore(form.store, (state) => state.values.providers);
    const defaultProvider = useStore(form.store, (state) => state.values.defaultProvider);

    return (
        <Form form={form}>
            {/* Status & main toggle */}
            <div className='rounded-2xl border border-border bg-card p-5'>
                <div className='flex items-start justify-between gap-4'>
                    <div className='flex items-start gap-3'>
                        <span className='mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary'>
                            <ShieldCheck size={20} aria-hidden />
                        </span>
                        <div>
                            <h3 className='text-base font-semibold text-foreground'>Captcha protection</h3>
                            <p className='mt-0.5 text-sm text-muted-foreground'>
                                Protect sign-in and sensitive forms. Choose a provider and save its keys — no
                                per-action setup needed for the defaults.
                            </p>
                        </div>
                    </div>
                    <form.AppField name='enabled'>
                        {(field) => <field.SwitchField label='' disabled={readOnly} />}
                    </form.AppField>
                </div>
                {!enabled && (
                    <Alert type='warning' className='mt-4 text-sm'>
                        <span>Captcha is off — sign-in and password forms are unprotected.</span>
                    </Alert>
                )}
                <div className='mt-4 max-w-sm'>
                    <form.AppField name='defaultProvider'>
                        {(field) => (
                            <field.SelectField
                                id='captcha_default_provider'
                                label='Default provider'
                                options={providerOptions}
                                description='Used for login, password reset, and other protected actions unless overridden.'
                                disabled={readOnly}
                            />
                        )}
                    </form.AppField>
                </div>
            </div>

            {/* Providers */}
            <div className='mt-6 space-y-4'>
                {providers.map((provider, index) => {
                    const draft = drafts[index];
                    const unsaved =
                        draft !== undefined && (draft.siteKey !== provider.site_key || draft.secretKey !== '');
                    const isDefault = defaultProvider === provider.name;

                    return (
                        <div key={provider.name} className='rounded-2xl border border-border bg-card p-5'>
                            <div className='flex items-center justify-between gap-3'>
                                <div className='flex items-center gap-2'>
                                    <h4 className='text-base font-semibold text-foreground'>{provider.label}</h4>
                                    {isDefault && enabled && (
                                        <span className='rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>
                                            Default
                                        </span>
                                    )}
                                    {provider.has_secret ? (
                                        <span className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400'>
                                            Key saved
                                        </span>
                                    ) : (
                                        <span className='rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground'>
                                            Not configured
                                        </span>
                                    )}
                                </div>
                                <form.AppField name={`providers[${index}].enabled`}>
                                    {(field) => <field.SwitchField label='Enabled' disabled={readOnly} />}
                                </form.AppField>
                            </div>

                            {provider.using_shipped_keys && (
                                <Alert type='warning' className='mt-4 text-sm'>
                                    <span>Using shipped test keys. Create your own keys before relying on this provider.</span>
                                </Alert>
                            )}
                            {provider.errors.length > 0 && (
                                <Alert type='danger' className='mt-4 text-sm'>
                                    <span>{provider.errors.join(' ')}</span>
                                </Alert>
                            )}

                            <div className='mt-4 grid gap-4 sm:grid-cols-2'>
                                <form.AppField name={`providers[${index}].siteKey`}>
                                    {(field) => (
                                        <field.TextField
                                            type='text'
                                            id={`captcha_${provider.name}_site_key`}
                                            label='Site key'
                                            description='Public key used in the browser.'
                                            disabled={readOnly}
                                        />
                                    )}
                                </form.AppField>
                                <form.AppField name={`providers[${index}].secretKey`}>
                                    {(field) => (
                                        <field.TextField
                                            type='password'
                                            id={`captcha_${provider.name}_secret_key`}
                                            label='Secret key'
                                            description={
                                                provider.has_secret
                                                    ? 'Leave blank to keep the saved secret.'
                                                    : 'Stored encrypted; never shown again.'
                                            }
                                            disabled={readOnly}
                                        />
                                    )}
                                </form.AppField>
                            </div>

                            <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4'>
                                <p className='text-xs text-muted-foreground'>
                                    {unsaved
                                        ? 'Save changes before testing — the test checks stored keys.'
                                        : 'Test verifies your saved keys with the provider.'}
                                </p>
                                <Button
                                    type='button'
                                    isSecondary
                                    disabled={readOnly || unsaved || testProvider.isPending}
                                    isLoading={
                                        testProvider.isPending && testProvider.variables?.path?.provider === provider.name
                                    }
                                    onClick={async () => {
                                        try {
                                            const answer = await testProvider.mutateAsync(
                                                testCaptchaProviderInput(provider.name)
                                            );
                                            setResults((current) => ({
                                                ...current,
                                                [provider.name]: captchaProviderTestResult(answer),
                                            }));
                                        } catch {
                                            // Error toast is handled by the mutation.
                                        }
                                    }}
                                >
                                    Test connection
                                </Button>
                            </div>
                            {results[provider.name] && <TestResult result={results[provider.name]} />}
                        </div>
                    );
                })}
            </div>

            {/* Advanced rules - collapsed by default */}
            <div className='mt-6 rounded-2xl border border-border bg-card'>
                <button
                    type='button'
                    className='flex w-full items-center justify-between gap-3 p-5 text-left'
                    onClick={() => setShowAdvanced((v) => !v)}
                >
                    <div>
                        <h3 className='text-base font-semibold text-foreground'>Advanced: verified actions</h3>
                        <p className='mt-0.5 text-sm text-muted-foreground'>
                            Override which provider protects specific actions. Defaults work for most panels.
                        </p>
                    </div>
                    {showAdvanced ? (
                        <ChevronDown className='size-5 text-muted-foreground' aria-hidden />
                    ) : (
                        <ChevronRight className='size-5 text-muted-foreground' aria-hidden />
                    )}
                </button>
                {showAdvanced && (
                    <div className='border-t border-border/60 p-5'>
                        <div className='space-y-3'>
                            {rules.map((rule, index) => (
                                <RuleRow
                                    key={rule.rowId}
                                    form={form}
                                    rule={rule}
                                    index={index}
                                    readOnly={readOnly}
                                    providerOptions={providerOptions}
                                    onRemove={() => form.removeFieldValue('rules', index)}
                                />
                            ))}
                        </div>
                        {!readOnly && (
                            <Button
                                type='button'
                                isSecondary
                                className='mt-4'
                                onClick={() => form.pushFieldValue('rules', newCaptchaRule())}
                            >
                                Add custom action
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div className='mt-6 flex justify-end'>
                <form.AppForm>
                    <form.SubmitButton disabled={readOnly}>Save Changes</form.SubmitButton>
                </form.AppForm>
            </div>
        </Form>
    );
}

export default function CaptchaSettingsForm({ readOnly }: { readOnly: boolean }) {
    const { data: settings, error, refetch } = useAdminCaptchaSettings();

    if (error && !settings) {
        return <ServerError message={httpErrorToHuman(error)} onRetry={() => void refetch()} />;
    }

    if (!settings) {
        return <Spinner size='large' centered />;
    }

    return <CaptchaForm settings={settings} readOnly={readOnly} />;
}
