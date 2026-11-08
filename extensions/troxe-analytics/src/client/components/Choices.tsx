interface Props<T extends string> {
    label: string;
    value: T;
    options: readonly { value: T; label: string }[];
    onChange: (value: T) => void;
}

/**
 * A small choice rendered as buttons rather than a dropdown: every option is visible without a
 * click, which is the right trade when there are half a dozen of them and they change what the
 * whole page means.
 */
export default function Choices<T extends string>({ label, value, options, onChange }: Props<T>) {
    return (
        <div className='trx:flex trx:flex-wrap trx:items-center trx:gap-2'>
            <span className='trx:text-xs trx:text-muted-foreground'>{label}</span>
            <div className='trx:flex trx:flex-wrap trx:gap-1' role='group' aria-label={label}>
                {options.map((option) =>
                    option.value === value ? (
                        <span key={option.value} className='trx:rounded-sm trx:bg-primary trx:px-2.5 trx:py-1 trx:text-xs trx:font-medium trx:text-primary-foreground' aria-current='true'>
                            {option.label}
                        </span>
                    ) : (
                        <button
                            key={option.value}
                            type='button'
                            onClick={() => onChange(option.value)}
                            className='trx:rounded-sm trx:px-2.5 trx:py-1 trx:text-xs trx:font-medium trx:text-muted-foreground trx:transition-colors trx:hover:bg-accent trx:hover:text-foreground'
                        >
                            {option.label}
                        </button>
                    ),
                )}
            </div>
        </div>
    );
}
