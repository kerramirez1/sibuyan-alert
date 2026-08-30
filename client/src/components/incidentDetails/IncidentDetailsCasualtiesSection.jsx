const toPositiveNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const IncidentDetailsCasualtiesSection = ({
    report = {},
    className = '',
}) => {
    const affectedArea = report.affectedArea || {};

    const households = toPositiveNumber(affectedArea.householdsAffected);
    const evacuees = toPositiveNumber(affectedArea.evacuees);
    const radius = toPositiveNumber(affectedArea.radius);
    const hasAffectedArea = households > 0 || evacuees > 0 || radius > 0;

    return (
        <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`} aria-labelledby="incident-affected-area-heading">
            <h3 id="incident-affected-area-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white mb-2">
                Affected area
            </h3>
            {hasAffectedArea ? (
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
            ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    No affected-area impacts recorded.
                </p>
            )}
        </section>
    );
};

export default IncidentDetailsCasualtiesSection;
