const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const CasualtyStatCard = ({ label, count, tone = 'default' }) => {
    const toneStyles = {
        default: 'border-gray-200/80 bg-gray-50/70 text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white',
        danger: 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200',
        warning: 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
    };

    return (
        <div className={`rounded-xl border p-2.5 sm:p-3 ${toneStyles[tone]}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-75">{label}</p>
            <p className="mt-1 text-base sm:text-lg font-bold tabular-nums">{count}</p>
        </div>
    );
};

const IncidentDetailsCasualtiesSection = ({
    report = {},
    className = '',
}) => {
    const casualties = report.casualties || {};
    const affectedArea = report.affectedArea || {};

    const injured = toPositiveNumber(casualties.injured);
    const fatalities = toPositiveNumber(casualties.fatalities);
    const missing = toPositiveNumber(casualties.missing);
    const households = toPositiveNumber(affectedArea.householdsAffected);
    const evacuees = toPositiveNumber(affectedArea.evacuees);
    const radius = toPositiveNumber(affectedArea.radius);

    const hasCasualtiesOrImpact = injured > 0 || fatalities > 0 || missing > 0 || households > 0 || evacuees > 0 || radius > 0;

    return (
        <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`} aria-labelledby="incident-casualties-heading">
            <h3 id="incident-casualties-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Casualties and affected area
            </h3>

            <div className="mt-2.5 grid grid-cols-3 gap-2">
                <CasualtyStatCard label="Injured" count={injured} tone={injured > 0 ? 'warning' : 'default'} />
                <CasualtyStatCard label="Fatalities" count={fatalities} tone={fatalities > 0 ? 'danger' : 'default'} />
                <CasualtyStatCard label="Missing" count={missing} tone={missing > 0 ? 'warning' : 'default'} />
            </div>

            {(households > 0 || evacuees > 0 || radius > 0) && (
                <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {households > 0 && (
                        <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/5">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Households</dt>
                            <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{households}</dd>
                        </div>
                    )}
                    {evacuees > 0 && (
                        <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/5">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Evacuees</dt>
                            <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{evacuees}</dd>
                        </div>
                    )}
                    {radius > 0 && (
                        <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-2.5 dark:border-white/10 dark:bg-white/5">
                            <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Affected radius</dt>
                            <dd className="mt-0.5 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{radius} meters</dd>
                        </div>
                    )}
                </dl>
            )}

            {!hasCasualtiesOrImpact && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    No casualties or affected-area impacts recorded.
                </p>
            )}
        </section>
    );
};

export default IncidentDetailsCasualtiesSection;
