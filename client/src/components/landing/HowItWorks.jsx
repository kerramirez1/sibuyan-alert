// The three high-level workflow stages. The large stage numbers and bold
// headings carry the hierarchy — no status pills.
const steps = [
    {
        n: '01',
        title: 'Reporter submits',
        desc: 'Verified residents file an incident with its location, category, severity, and supporting photos.',
    },
    {
        n: '02',
        title: 'Administrator verifies',
        desc: 'The responsible municipal administrator reviews the report before it is published for operational use.',
    },
    {
        n: '03',
        title: 'Responders act',
        desc: 'Authorized municipal response units receive eligible incidents and coordinate field response.',
    },
];

// Typical incident journey — a simplified, public-facing progression matching system status colors.
const JOURNEY_STAGES = [
    { key: 'reported', label: 'Reported', dotClass: 'bg-amber-500' },
    { key: 'under_review', label: 'Under review', dotClass: 'bg-amber-500' },
    { key: 'verified', label: 'Verified', dotClass: 'bg-blue-600' },
    { key: 'in_progress', label: 'Responding', dotClass: 'bg-cyan-600 animate-pulse ring-2 ring-cyan-400/40' },
    { key: 'resolved', label: 'Resolved', dotClass: 'bg-emerald-600' },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-200/80 bg-gray-50/50 px-5 py-16 dark:border-white/5 dark:bg-[#08140f] sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl sm:mb-12">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-400">
                    ISLAND-WIDE DISPATCH PROTOCOL
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                    From report to field response.
                </h2>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    One incident record moves from citizen reporting to municipal verification and coordinated field response.
                </p>
            </div>

            {/* ── Flat structural grid — hairline dividers carry the structure ── */}
            <div
                role="list"
                aria-label="Incident workflow stages in order"
                className="grid grid-cols-1 divide-y divide-gray-200 md:grid-cols-3 md:divide-y-0 md:divide-x dark:divide-white/10"
            >
                {steps.map(({ n, title, desc }) => (
                    <div key={n} role="listitem" className="relative min-w-0 p-5 sm:p-6">
                        <span
                            aria-hidden="true"
                            className="font-mono text-2xl sm:text-3xl font-black tracking-tight text-gray-300 dark:text-gray-700"
                        >
                            {n}
                        </span>
                        <h3 className="mt-3 text-sm font-bold text-gray-950 dark:text-white sm:text-base">
                            {title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                            {desc}
                        </p>
                    </div>
                ))}
            </div>

            {/* ── Incident Journey — flat text ledger, no card chrome ── */}
            <div className="mt-10 border-t border-gray-200 pt-5 sm:mt-14 dark:border-white/10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                        Typical incident journey
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Some reports may be transferred to the appropriate municipality during review.
                    </p>
                </div>
                <p id="incident-journey-scroll-hint" className="sr-only">
                    A simplified incident progression. Select or scroll horizontally to view every stage in order.
                </p>
                <div
                    className="flex flex-nowrap items-center gap-x-2 overflow-x-auto overscroll-x-contain pb-1 pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    role="list"
                    aria-label="Incident status stages in order"
                    aria-describedby="incident-journey-scroll-hint"
                    tabIndex={0}
                >
                    {JOURNEY_STAGES.map((stage, index) => (
                        <div key={stage.key} className="flex shrink-0 items-center gap-2">
                            <span
                                role="listitem"
                                className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-medium leading-none text-gray-700 dark:text-gray-300"
                            >
                                <span className={`h-2.5 w-2.5 rounded-full ${stage.dotClass}`} aria-hidden="true" />
                                {stage.label}
                            </span>
                            {index < JOURNEY_STAGES.length - 1 && (
                                <span className="h-[1px] w-6 shrink-0 bg-gray-200 sm:w-8 dark:bg-white/15" aria-hidden="true" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </section>
);

export default HowItWorks;
