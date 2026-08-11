// The three high-level workflow stages. Each shows the responsible role,
// an editorial stage label, and a concise public-facing description.
const steps = [
    {
        n: '01',
        role: 'Report',
        title: 'Reporter submits',
        desc: 'Verified residents file an incident with its location, category, severity, and supporting photos.',
    },
    {
        n: '02',
        role: 'Verify',
        title: 'Administrator verifies',
        desc: 'The responsible municipal administrator reviews the report before it is published for operational use.',
    },
    {
        n: '03',
        role: 'Respond',
        title: 'Responders act',
        desc: 'Authorized municipal response units receive eligible incidents and coordinate field response.',
    },
];

// Typical incident journey — a simplified, public-facing progression for the
// landing page. This intentionally shows the common happy path; it is not an
// exhaustive map of every backend status (transferred / rejected are handled
// during review). Labels use public-friendly wording rather than raw backend
// status names, so internal keys are neutral tokens rather than status codes.
const JOURNEY_STAGES = [
    { key: 'reported', label: 'Reported' },
    { key: 'under_review', label: 'Under review' },
    { key: 'verified', label: 'Verified' },
    { key: 'in_progress', label: 'Responding' },
    { key: 'resolved', label: 'Resolved' },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-100 bg-gray-50 px-5 py-20 dark:border-white/10 dark:bg-[#101f1c] sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl sm:mb-14">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">ISLAND-WIDE DISPATCH PROTOCOL</p>
                <h2 className="mb-2 text-2xl font-black leading-tight tracking-tight text-gray-950 dark:text-white sm:text-3xl">From report to field response.</h2>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    One incident record moves from citizen reporting to municipal verification and coordinated field response.
                </p>
            </div>

            {/* ── Editorial workflow timeline ──────────────────────────────────
                 Transformed into solid dispatch cards connected by a pipeline track. */}
            <div
                role="list"
                aria-label="Incident workflow stages in order"
                className="relative flex flex-col gap-6 sm:flex-row sm:gap-8"
            >
                {/* Pipeline track (desktop only) */}
                <div className="absolute left-0 top-1/2 hidden h-[2px] w-full -translate-y-1/2 bg-gray-200 dark:bg-white/10 sm:block" aria-hidden="true" />

                {steps.map(({ n, role, title, desc }) => (
                    <div key={n} role="listitem" className="relative min-w-0 flex-1">
                        <div className="relative flex h-full flex-col rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/60">
                            <div className="mb-4">
                                <span
                                    aria-hidden="true"
                                    className="text-4xl font-black tracking-tighter text-gray-300 dark:text-gray-700"
                                >
                                    {n}
                                </span>
                            </div>
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                {role}
                            </p>
                            <h3 className="mb-2 text-base font-bold text-gray-950 dark:text-white">{title}</h3>
                            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                                {desc}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Typical incident journey ─────────────────────────────────────
                 A simplified, public-facing happy-path progression. It does not
                 enumerate every technical status; transfers/rejections happen
                 during review. */}

            <div className="mt-12 sm:mt-16">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                    Typical incident journey
                </p>
                <p id="incident-journey-scroll-hint" className="sr-only">
                    A simplified incident progression. Select or scroll horizontally to view every stage in order.
                </p>
                <div
                    className="flex flex-nowrap items-center gap-x-2 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
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
                                <span className={`h-2.5 w-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400 ${stage.key === 'in_progress' ? 'animate-pulse' : ''}`} aria-hidden="true" />
                                {stage.label}
                            </span>
                            {index < JOURNEY_STAGES.length - 1 && (
                                <span className="h-[2px] w-6 shrink-0 bg-gray-200 sm:w-8 dark:bg-white/15" aria-hidden="true" />
                            )}
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                    Some reports may be transferred to the appropriate municipality during review.
                </p>
            </div>
        </div>
    </section>
);

export default HowItWorks;
