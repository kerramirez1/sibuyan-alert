import { HiOutlineBadgeCheck, HiOutlineMail, HiOutlineUser } from 'react-icons/hi';

const IncidentDetailsReporterSection = ({
    reporter = {},
    showContact = false,
    className = '',
}) => {
    if (!reporter || (!reporter.name && !reporter.email)) {
        return null;
    }

    return (
        <section className={`border-t border-gray-100 py-3.5 dark:border-white/5 ${className}`} aria-labelledby="incident-reporter-heading">
            <h3 id="incident-reporter-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Reporter information
            </h3>
            <div className="mt-2 rounded-xl border border-gray-200/80 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2">
                    <HiOutlineUser className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                        {reporter.name || 'Anonymous reporter'}
                    </span>
                    {reporter.isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                            <HiOutlineBadgeCheck className="h-3 w-3" aria-hidden="true" />
                            Verified
                        </span>
                    )}
                </div>

                {showContact && reporter.email && (
                    <a
                        href={`mailto:${reporter.email}`}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-200 dark:hover:bg-white/5"
                    >
                        <HiOutlineMail className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        {reporter.email}
                    </a>
                )}
            </div>
        </section>
    );
};

export default IncidentDetailsReporterSection;
