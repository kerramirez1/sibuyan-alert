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
        desc: 'The responsible municipal administrator reviews every report and records the verification on the incident record. When an incident involves casualties, responders may act first; the review is still completed on the same record.',
    },
    {
        n: '03',
        title: 'Responders act',
        desc: 'Authorized municipal response units act on incidents in their municipality — dispatched after verification, or responding ahead of it when an incident cannot wait.',
    },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-[var(--border)] bg-[var(--surface)] px-5 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-6xl">
            <div className="mb-6 max-w-2xl sm:mb-8">
                <p className="page-eyebrow">
                    ISLAND-WIDE DISPATCH PROTOCOL
                </p>
                <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                    From report to field response.
                </h2>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    One incident record carries a report from citizen reporting to coordinated field response. Municipal verification is recorded on the same record — before response when time allows, and alongside it when the incident cannot wait.
                </p>
            </div>

            {/* ── Flat structural grid — hairline dividers carry the structure ── */}
            <div
                role="list"
                aria-label="Incident workflow stages in order"
                className="grid grid-cols-1 divide-y divide-gray-200 md:grid-cols-3 md:divide-y-0 md:divide-x dark:divide-white/10"
            >
                {steps.map(({ n, title, desc }) => (
                    <div key={n} role="listitem" className="relative min-w-0 px-4 py-5 sm:px-6">
                        <span
                            aria-hidden="true"
                            className="font-display text-2xl font-semibold tracking-tight text-[var(--accent-text)]"
                        >
                            {n}
                        </span>
                        <h3 className="section-title mt-3">
                            {title}
                        </h3>
                        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                            {desc}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default HowItWorks;
