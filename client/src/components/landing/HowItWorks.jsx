import { HiOutlineArrowNarrowRight, HiOutlineClipboardCheck, HiOutlineDocumentText, HiOutlineShieldCheck } from 'react-icons/hi';

// The three high-level workflow stages. Each shows the responsible role,
// an editorial stage label, and a concise public-facing description.
const steps = [
    {
        n: '01',
        Icon: HiOutlineDocumentText,
        role: 'Report',
        title: 'Reporter submits',
        desc: 'Verified residents file an incident with its location, category, severity, and supporting photos.',
    },
    {
        n: '02',
        Icon: HiOutlineClipboardCheck,
        role: 'Verify',
        title: 'Administrator verifies',
        desc: 'The responsible municipal administrator reviews the report before it is published for operational use.',
    },
    {
        n: '03',
        Icon: HiOutlineShieldCheck,
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
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">How it works</p>
                <h2 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">From report to field response.</h2>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    One incident record moves from citizen reporting to municipal verification and coordinated field response.
                </p>
            </div>

            {/* ── Editorial workflow timeline ──────────────────────────────────
                 A flat horizontal procession on desktop, stacking on mobile. No
                 enclosing card — structure comes from a subtle top rule, the
                 stage typography, and thin directional connectors. */}
            <div
                role="list"
                aria-label="Incident workflow stages in order"
                className="flex flex-col sm:flex-row"
            >
                {steps.map(({ n, Icon, role, title, desc }, index) => (
                    <div key={n} role="listitem" className="relative min-w-0 flex-1">
                        <div className="relative border-t border-gray-200 pt-6 dark:border-white/10 sm:pt-7">
                            {/* Thin connector arrow at each stage seam (desktop only) */}
                            {index > 0 && (
                                <HiOutlineArrowNarrowRight
                                    aria-hidden="true"
                                    className="absolute -left-1 top-0 hidden h-3.5 w-3.5 -translate-y-1/2 text-gray-300 sm:block dark:text-gray-600"
                                />
                            )}
                            <div className="flex items-center gap-3 sm:pr-8">
                                <span
                                    aria-hidden="true"
                                    className="text-sm font-black leading-none tracking-tight text-gray-300 dark:text-gray-600"
                                >
                                    {n}
                                </span>
                                <Icon
                                    aria-hidden="true"
                                    className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                                />
                            </div>
                            <p className="mt-2.5 text-xs font-bold uppercase tracking-widest text-gray-950 dark:text-white">
                                {role}
                            </p>
                            <h3 className="mt-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">{title}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400 sm:pr-8">
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
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" aria-hidden="true" />
                                {stage.label}
                            </span>
                            {index < JOURNEY_STAGES.length - 1 && (
                                <span className="h-px w-6 shrink-0 bg-gray-200 sm:w-8 dark:bg-white/15" aria-hidden="true" />
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
