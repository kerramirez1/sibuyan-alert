import { HiOutlineExclamationCircle } from 'react-icons/hi';

const IncidentDetailsDescriptionSection = ({
    description = '',
    safetyIndicators = [],
    isOperational = false,
    className = '',
}) => {
    return (
        <section className={className} aria-labelledby="incident-description-heading">
            <h3 id="incident-description-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                {isOperational ? 'Operational description' : 'Description'}
            </h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {description?.trim() || <span className="italic text-gray-400 dark:text-gray-500">No incident description was provided.</span>}
            </p>

            {safetyIndicators.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20" aria-label="Critical safety indicators">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        <HiOutlineExclamationCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Safety indicators
                    </h4>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {safetyIndicators.map((indicator) => (
                            <li
                                key={indicator}
                                className="rounded-md border border-amber-200/60 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                                {indicator}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default IncidentDetailsDescriptionSection;
