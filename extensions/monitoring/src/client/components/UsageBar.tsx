/** The usage bar from the node About tab. */
export default function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
    const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
    const colour = percent >= 90 ? 'mon:bg-destructive' : percent >= 75 ? 'mon:bg-warning' : 'mon:bg-success';

    return (
        <div className='mon:min-w-24'>
            <p className='mon:text-xs mon:text-muted-foreground'>{label}</p>
            <div className='mon:mt-1 mon:h-2 mon:w-full mon:overflow-hidden mon:rounded-sm mon:bg-sunken' role='meter' aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                <div className={`mon:h-2 mon:rounded-sm ${colour}`} style={{ width: `${percent}%` }} />
            </div>
        </div>
    );
}
