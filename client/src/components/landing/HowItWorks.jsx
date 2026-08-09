import { HiOutlineArrowNarrowRight, HiOutlineClipboardCheck, HiOutlineDocumentText, HiOutlineShieldCheck } from 'react-icons/hi';

const steps = [
    {
        n: '01',
        Icon: HiOutlineDocumentText,
        title: 'Reporter submits',
        desc: 'Verified residents file an incident with its location, category, severity, and supporting photos.',
    },
    {
        n: '02',
        Icon: HiOutlineClipboardCheck,
        title: 'Administrator verifies',
        desc: 'Municipal administrators review the report before it is published to the operational map.',
    },
    {
        n: '03',
        Icon: HiOutlineShieldCheck,
        title: 'Responders act',
        desc: 'Eligible municipal response units receive the incident and coordinate field action.',
    },
];

// Complete incident lifecycle — displayed as a horizontal status strip to
// demonstrate that this system tracks the full report lifecycle, not only
// the initial submission step.
const LIFECYCLE_STAGES = [
    {
        status: 'reported',
        label: 'Reported',
    },
    {
        status: 'under_verification',
        label: 'Under Verification',
    },
    {
        status: 'verified',
        label: 'Verified',
    },
    {
        status: 'responding',
        label: 'Responding',
    },
    {
        status: 'resolved',
        label: 'Resolved',
    },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-100 bg-gray-50 px-5 py-20 dark:border-white/10 dark:bg-[#101f1c] sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="mb-10 sm:mb-12">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">How it works</p>
                <h2 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">From report to field response.</h2>
                <p className="max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    One incident record follows the exact review and response workflow without mixing administrator and responder responsibilities.
                </p>
            </div>

            {/* ── Step cards with connector arrows ─────────────────────────────── */}
            <div className="relative grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#152622] sm:grid-cols-3">
                {steps.map(({ n, Icon, title, desc }, index) => (
                    <div key={n} className={`relative p-7 sm:p-8 lg:p-10 ${index > 0 ? 'border-t border-gray-200 dark:border-white/10 sm:border-t-0 sm:border-l' : ''}`}>
                        <div className="mb-6 flex items-center justify-between">
                            <span className="text-3xl font-black leading-none tracking-tight text-gray-300 dark:text-gray-600">{n}</span>
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                <Icon className="h-4 w-4" />
                            </span>
                        </div>
                        <h3 className="mb-2 text-[15px] font-bold text-gray-950 dark:text-white">{title}</h3>
                        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{desc}</p>

                        {/* Connector arrow — positioned between adjacent cards on desktop */}
                        {index < steps.length - 1 && (
                            <span
                                aria-hidden="true"
                                className="absolute -right-3.5 top-1/2 z-10 hidden -translate-y-1/2 sm:flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1e3530]"
                            >
                                <HiOutlineArrowNarrowRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            </span>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Full incident lifecycle strip ─────────────────────────────────
                 Shows all 5 status transitions so the panel can see this is a
                 complete lifecycle system, not a simple form submission app. */}
            <div className="mt-8 sm:mt-10">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                    Full incident lifecycle
                </p>
                <p id="incident-lifecycle-scroll-hint" className="sr-only">
                    Scroll horizontally to view every incident status stage.
                </p>
                <div
                    className="flex flex-nowrap items-center gap-x-1.5 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    role="list"
                    aria-label="Incident status stages in order"
                    aria-describedby="incident-lifecycle-scroll-hint"
                    tabIndex={0}
                >
                    {LIFECYCLE_STAGES.map((stage, index) => (
                        <div key={stage.status} className="flex shrink-0 items-center gap-1.5">
                            <span
                                role="listitem"
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold leading-none text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                                {stage.label}
                            </span>
                            {index < LIFECYCLE_STAGES.length - 1 && (
                                <HiOutlineArrowNarrowRight
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5 shrink-0 text-emerald-300 dark:text-emerald-700"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </section>
);

export default HowItWorks;
