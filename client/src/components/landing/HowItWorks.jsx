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

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-200/80 bg-white px-5 py-10 dark:border-white/5 dark:bg-gray-950 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-6xl">
            <div className="mb-6 max-w-2xl sm:mb-8">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-700 dark:text-sky-400">
                    ISLAND-WIDE DISPATCH PROTOCOL
                </p>
                <h2 className="font-display text-xl font-bold tracking-tight text-gray-950 dark:text-white sm:text-2xl">
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
                    <div key={n} role="listitem" className="relative min-w-0 p-4">
                        <span
                            aria-hidden="true"
                            className="font-mono text-xl sm:text-2xl font-black tracking-tight text-gray-300 dark:text-gray-700"
                        >
                            {n}
                        </span>
                        <h3 className="mt-2 text-sm font-bold text-gray-950 dark:text-white">
                            {title}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                            {desc}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default HowItWorks;
