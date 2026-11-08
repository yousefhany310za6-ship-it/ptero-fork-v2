// Generated from kit/settings/SettingsPage.tsx by scripts/kit.mjs for branding. Do not edit here.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input, PageContentBlock, Select, Spinner, Switch, http, toast, usePanelNavigate } from '@pterodactyl/sdk';
import './settings.css';

/**
 * A full settings page for an extension, built from the settings it registers with the panel (the same list the
 * panel's small Settings dialog shows), so every option is on a real page with sections, search and a save bar.
 * The panel validates each save; a field it rejects is shown under that field and the rest are saved.
 */

type Value = string | number | boolean | (string | number)[] | null;

export interface SettingField {
    input: string;
    label: string;
    help: string | null;
    tab: string | null;
    field: 'text' | 'password' | 'number' | 'toggle' | 'select' | 'color' | 'textarea' | 'multiselect' | 'list' | 'file';
    options: { value: string | number | boolean; label: string }[];
    value: Value;
    constraints: { max_length: number | null; max_items: number | null; max_kilobytes: number | null; accept: string[] };
}

type ApiError = { response?: { status?: number; data?: { errors?: { detail?: string; meta?: { source_field?: string } }[] } } };

const GENERAL = 'General';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const url = (extension: string) => `/api/admin/extensions/${extension}/settings`;
const errorText = (error: unknown, fallback: string) => (error as ApiError).response?.data?.errors?.[0]?.detail ?? fallback;

const outgoing = (value: Value): Value => {
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '');
    if (typeof value === 'string') return value.trim();
    return value;
};

/** The settings of one extension: loading, editing, and saving only what changed. */
export function useExtensionSettings(extension: string) {
    const [schema, setSchema] = useState<SettingField[] | null>(null);
    const [draft, setDraft] = useState<Record<string, Value>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [failed, setFailed] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const apply = (next: SettingField[]) => {
        setSchema(next);
        setDraft(Object.fromEntries(next.map((f) => [f.input, f.value])));
    };

    useEffect(() => {
        http.get<{ data: { schema: SettingField[] } }>(url(extension))
            .then(({ data }) => apply(data.data.schema))
            .catch((error: unknown) => setFailed(errorText(error, 'The settings could not be loaded.')));
    }, [extension]);

    const changed = useMemo(() => (schema ?? []).filter((f) => f.field !== 'file' && !same(draft[f.input], f.value)).map((f) => f.input), [schema, draft]);

    const save = async () => {
        if (!schema || changed.length === 0) return;
        setSaving(true);
        setErrors({});
        let keys = [...changed];
        const rejected: Record<string, string> = {};
        try {
            for (let attempt = 0; attempt < 2 && keys.length > 0; attempt++) {
                try {
                    const { data } = await http.patch<{ data: { schema: SettingField[] } }>(url(extension), {
                        settings: Object.fromEntries(keys.map((k) => [k, outgoing(draft[k])])),
                    });
                    const fresh = data.data.schema;
                    setSchema(fresh);
                    // Keep anything the panel refused in the draft, so it can be fixed.
                    setDraft(Object.fromEntries(fresh.map((f) => [f.input, f.input in rejected ? draft[f.input] : f.value])));
                    break;
                } catch (error) {
                    const found = new Map<string, string>();
                    for (const e of (error as ApiError).response?.data?.errors ?? []) {
                        const key = e.meta?.source_field?.replace(/^settings\./, '').split('.')[0];
                        if (key && keys.includes(key) && !found.has(key)) found.set(key, e.detail ?? 'Not accepted.');
                    }
                    if (found.size === 0 || attempt > 0) throw error;
                    found.forEach((message, key) => (rejected[key] = message));
                    keys = keys.filter((k) => !found.has(k));
                }
            }
            setErrors(rejected);
            if (Object.keys(rejected).length > 0) toast.error('Some settings were not saved. See the highlighted fields.');
            else toast.success('Settings saved.');
        } catch (error) {
            toast.error(errorText(error, 'The settings could not be saved.'));
        } finally {
            setSaving(false);
        }
    };

    const upload = async (field: SettingField, file: File | null) => {
        try {
            if (file) {
                const form = new FormData();
                form.append('file', file);
                const { data } = await http.post<{ data: { schema: SettingField[] } }>(`${url(extension)}/${field.input}/file`, form);
                if (data?.data?.schema) apply(data.data.schema);
            } else {
                const { data } = await http.delete<{ data: { schema: SettingField[] } }>(`${url(extension)}/${field.input}/file`);
                if (data?.data?.schema) apply(data.data.schema);
            }
            if (!file || !schema) {
                const { data } = await http.get<{ data: { schema: SettingField[] } }>(url(extension));
                apply(data.data.schema);
            }
            toast.success(file ? 'File uploaded.' : 'File removed.');
        } catch (error) {
            toast.error(errorText(error, 'The file could not be saved.'));
        }
    };

    return {
        schema,
        draft,
        errors,
        failed,
        saving,
        changed,
        set: (input: string, value: Value) => setDraft((d) => ({ ...d, [input]: value })),
        discard: () => schema && setDraft(Object.fromEntries(schema.map((f) => [f.input, f.value]))),
        save,
        upload,
    };
}

export type ExtensionSettings = ReturnType<typeof useExtensionSettings>;

interface PageProps {
    extension: string;
    title: string;
    description: string;
    icon?: ReactNode;
    /** Extra sections drawn before the registered settings (an extension's own tools). */
    extra?: { name: string; render: () => ReactNode }[];
}

/** The whole page: header, section list, search, fields and the save bar. */
export function SettingsPage({ extension, title, description, icon, extra = [] }: PageProps) {
    const navigate = usePanelNavigate();
    const settings = useExtensionSettings(extension);
    const [query, setQuery] = useState('');
    const sections = useMemo(() => {
        const map = new Map<string, SettingField[]>();
        for (const field of settings.schema ?? []) map.set(field.tab || GENERAL, [...(map.get(field.tab || GENERAL) ?? []), field]);
        return [...extra.map((e) => ({ name: e.name, fields: [] as SettingField[], render: e.render })), ...[...map].map(([name, fields]) => ({ name, fields, render: undefined }))];
    }, [settings.schema, extra]);
    const [active, setActive] = useState<string | null>(null);
    const current = sections.find((s) => s.name === active) ?? sections[0];
    const needle = query.trim().toLowerCase();
    const matches = needle
        ? (settings.schema ?? []).filter((f) => `${f.label} ${f.help ?? ''} ${f.tab ?? ''}`.toLowerCase().includes(needle))
        : null;
    const dirtyIn = (name: string) => (settings.schema ?? []).some((f) => (f.tab || GENERAL) === name && settings.changed.includes(f.input));

    return (
        <PageContentBlock title={title}>
            <div className='br-sp'>
                <header className='br-sp-head'>
                    {icon && <div className='br-sp-icon'>{icon}</div>}
                    <div className='br-sp-title'>
                        <h1>{title}</h1>
                        <p>{description}</p>
                    </div>
                    <Button isSecondary onClick={() => void navigate({ to: '/panel/extensions' })}>
                        All extensions
                    </Button>
                </header>

                {settings.failed ? (
                    <div className='br-sp-card br-sp-empty'>{settings.failed}</div>
                ) : !settings.schema ? (
                    <div className='br-sp-card br-sp-empty'>
                        <Spinner />
                    </div>
                ) : sections.length === 0 ? (
                    <div className='br-sp-card br-sp-empty'>This extension has no settings.</div>
                ) : (
                    <div className='br-sp-body'>
                        <nav className='br-sp-nav' aria-label='Sections'>
                            <div className='br-sp-search'>
                                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Search settings' aria-label='Search settings' />
                            </div>
                            {sections.map((s) => (
                                <button
                                    key={s.name}
                                    type='button'
                                    aria-current={!matches && s === current ? 'page' : undefined}
                                    onClick={() => {
                                        setQuery('');
                                        setActive(s.name);
                                    }}
                                >
                                    <span>{s.name}</span>
                                    {dirtyIn(s.name) ? <i className='br-sp-dot' aria-label='Unsaved changes' /> : s.fields.length > 0 && <small>{s.fields.length}</small>}
                                </button>
                            ))}
                        </nav>
                        <section className='br-sp-card br-sp-fields' key={matches ? 'search' : current.name}>
                            <h2>{matches ? (matches.length ? `${matches.length} found` : 'Nothing found') : current.name}</h2>
                            {matches
                                ? matches.map((field) => <FieldRow key={field.input} field={field} settings={settings} showTab />)
                                : current.render
                                  ? current.render()
                                  : current.fields.map((field) => <FieldRow key={field.input} field={field} settings={settings} />)}
                        </section>
                    </div>
                )}

                <SaveBar settings={settings} />
            </div>
        </PageContentBlock>
    );
}

/** The registered settings of one or more sections, for an extension page that has its own layout. */
export function SettingsFields({ settings, tabs }: { settings: ExtensionSettings; tabs?: string[] }) {
    if (!settings.schema) return <Spinner />;
    const fields = settings.schema.filter((f) => !tabs || tabs.includes(f.tab || GENERAL));
    return (
        <div className='br-sp br-sp-inline'>
            <div className='br-sp-card br-sp-fields'>
                {fields.map((field) => (
                    <FieldRow key={field.input} field={field} settings={settings} />
                ))}
            </div>
            <SaveBar settings={settings} />
        </div>
    );
}

function SaveBar({ settings }: { settings: ExtensionSettings }) {
    if (settings.changed.length === 0) return null;
    return (
        <div className='br-sp-save' role='status'>
            <span>{settings.changed.length === 1 ? '1 unsaved change' : `${settings.changed.length} unsaved changes`}</span>
            <Button isSecondary onClick={settings.discard} disabled={settings.saving}>
                Discard
            </Button>
            <Button onClick={() => void settings.save()} disabled={settings.saving}>
                {settings.saving ? 'Saving…' : 'Save changes'}
            </Button>
        </div>
    );
}

function FieldRow({ field, settings, showTab }: { field: SettingField; settings: ExtensionSettings; showTab?: boolean }) {
    const value = settings.draft[field.input];
    const set = (v: Value) => settings.set(field.input, v);
    const wide = field.field === 'textarea' || field.field === 'list' || field.field === 'multiselect' || field.field === 'file';
    const dirty = settings.changed.includes(field.input);
    const error = settings.errors[field.input];
    const id = `br-sp-${field.input}`;

    let control: ReactNode;
    switch (field.field) {
        case 'toggle':
            control = <Switch checked={value === true} onChange={(v: boolean) => set(v)} aria-label={field.label} />;
            break;
        case 'number':
            control = <Input id={id} type='number' value={value === null ? '' : String(value)} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} style={{ width: '9rem' }} />;
            break;
        case 'select':
            control = (
                <div style={{ minWidth: '14rem' }}>
                    <Select id={id} value={value as string | number | null} options={field.options.map((o) => ({ value: o.value as string | number, label: o.label }))} onChange={(v) => set(v as string)} />
                </div>
            );
            break;
        case 'color':
            control = (
                <div className='br-sp-color'>
                    <input type='color' value={typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} aria-label={field.label} />
                    <Input value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} style={{ width: '8rem' }} />
                </div>
            );
            break;
        case 'textarea':
            control = <textarea id={id} className='br-sp-textarea' rows={6} value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} maxLength={field.constraints.max_length ?? undefined} spellCheck={false} />;
            break;
        case 'multiselect': {
            const list = Array.isArray(value) ? value.map(String) : [];
            control = (
                <div className='br-sp-chips'>
                    {field.options.map((o) => {
                        const on = list.includes(String(o.value));
                        return (
                            <button key={String(o.value)} type='button' aria-pressed={on} onClick={() => set(on ? list.filter((v) => v !== String(o.value)) : [...list, String(o.value)])}>
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            );
            break;
        }
        case 'list':
            control = <ListEditor value={Array.isArray(value) ? value.map(String) : []} max={field.constraints.max_items} onChange={set} label={field.label} />;
            break;
        case 'file':
            control = <FileField field={field} onUpload={(file) => void settings.upload(field, file)} />;
            break;
        default:
            control = <Input id={id} type={field.field === 'password' ? 'password' : 'text'} value={value === null ? '' : String(value)} onChange={(e) => set(e.target.value)} maxLength={field.constraints.max_length ?? undefined} autoComplete='off' style={{ width: 'min(22rem, 100%)' }} />;
    }

    return (
        <div className={`br-sp-field ${wide ? 'br-sp-wide' : ''}`} data-dirty={dirty || undefined} data-error={error ? true : undefined}>
            <div className='br-sp-label'>
                <label htmlFor={id}>
                    {field.label}
                    {showTab && field.tab && <small>{field.tab}</small>}
                </label>
                {field.help && <p>{field.help}</p>}
                {error && <p className='br-sp-error'>{error}</p>}
            </div>
            <div className='br-sp-control'>{control}</div>
        </div>
    );
}

function ListEditor({ value, max, onChange, label }: { value: string[]; max: number | null; onChange: (v: string[]) => void; label: string }) {
    const [text, setText] = useState('');
    const add = () => {
        const v = text.trim();
        if (!v || value.includes(v) || (max !== null && value.length >= max)) return;
        onChange([...value, v]);
        setText('');
    };
    return (
        <div className='br-sp-list'>
            {value.map((item, i) => (
                <div key={`${item}-${i}`} className='br-sp-list-row'>
                    <input value={item} aria-label={`${label} ${i + 1}`} onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))} spellCheck={false} />
                    <button type='button' title='Move up' disabled={i === 0} onClick={() => onChange(value.map((v, j) => (j === i - 1 ? value[i] : j === i ? value[i - 1] : v)))}>
                        ↑
                    </button>
                    <button type='button' title='Remove' onClick={() => onChange(value.filter((_, j) => j !== i))}>
                        ✕
                    </button>
                </div>
            ))}
            <div className='br-sp-list-row br-sp-list-add'>
                <input
                    value={text}
                    placeholder='Add an item'
                    aria-label={`Add to ${label}`}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                    spellCheck={false}
                />
                <button type='button' onClick={add} disabled={!text.trim() || (max !== null && value.length >= max)}>
                    Add
                </button>
            </div>
            {max !== null && <small>{`${value.length} / ${max}`}</small>}
        </div>
    );
}

function FileField({ field, onUpload }: { field: SettingField; onUpload: (file: File | null) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const src = typeof field.value === 'string' && field.value !== '' ? field.value : null;
    return (
        <div className='br-sp-file'>
            <div className='br-sp-file-preview'>{src ? <img src={src} alt='' /> : <span>No file</span>}</div>
            <input
                ref={input}
                type='file'
                hidden
                accept={field.constraints.accept.join(',') || undefined}
                onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    if (file) onUpload(file);
                }}
            />
            <Button isSecondary onClick={() => input.current?.click()}>
                {src ? 'Replace' : 'Upload'}
            </Button>
            {src && (
                <Button isSecondary color='red' onClick={() => onUpload(null)}>
                    Remove
                </Button>
            )}
            {field.constraints.max_kilobytes && <small>{`Up to ${field.constraints.max_kilobytes >= 1024 ? `${Math.round(field.constraints.max_kilobytes / 1024)} MB` : `${field.constraints.max_kilobytes} KB`}`}</small>}
        </div>
    );
}
