const TRUST_ITEMS = [
    'Municipal administrator review before public visibility',
    'GPS-based incident location',
    'Reporter identity verified before account approval',
    'Real-time status updates across the full lifecycle',
    'Secure, role-based access for each user type',
];

const logoConfig = {
    Cajidiocan: { src: '/icons/Cajidiocan.logo.png', scale: 'scale-150' },
    Magdiwang: { src: '/icons/Magdiwang.logo.png', scale: 'scale-150' },
    'San Fernando': { src: '/icons/Sanfernando.logo.png', scale: 'scale-75' },
};

const fallbackBarangayCount = (name) => {
    if (!name) return 0;
    if (name === 'Cajidiocan') return 14;
    if (name === 'Magdiwang') return 9;
    return 12;
};

const Coverage = ({ municipalities = [] }) => {
    const list = Array.isArray(municipalities) ? municipalities : [];
    const getBarangayCount = (municipality) => (
        Array.isArray(municipality?.barangays) && municipality.barangays.length > 0
            ? municipality.barangays.length
            : fallbackBarangayCount(municipality?.name)
    );

    return (
        <section className="relative isolate bg-brand-950 px-5 py-10 text-white sm:px-8 sm:py-12 dark:bg-brand-950">
            <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.72fr)] lg:gap-10 xl:gap-14">
                <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-sky-300">Coverage</p>
                    <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">Connected across Sibuyan Island.</h2>
                    <p className="mb-5 mt-1.5 max-w-xl text-xs leading-relaxed text-slate-300">
                        The platform serves the island&apos;s three municipalities while keeping report visibility, administration, and response responsibilities properly scoped.
                    </p>

                    {/* Municipality List — flat ledger with hairline row dividers */}
                    <ul
                        data-testid="municipality-coverage-list"
                        aria-label="Municipalities covered"
                        className="flex flex-col"
                    >
                        {list.map((municipality, index) => {
                            const logo = logoConfig[municipality?.name];
                            const barangayCount = getBarangayCount(municipality);
                            return (
                                <li
                                    key={municipality?.code ?? index}
                                    className="flex min-w-0 items-center gap-2.5 border-b border-white/10 px-1 py-2 sm:gap-3 sm:px-2 sm:py-2.5"
                                >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden p-0.5 sm:h-9 sm:w-9">
                                        {logo
                                            ? <img src={logo.src} alt={`${municipality?.name ?? 'Municipality'} seal`} className={`h-full w-full object-contain opacity-90 ${logo.scale}`} />
                                            : <span className="text-base font-bold text-slate-200">{municipality?.name?.[0] ?? '?'}</span>}
                                    </span>
                                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-6">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate text-xs font-bold uppercase tracking-wider text-white">{municipality?.name ?? 'Unknown municipality'}</p>
                                        </div>
                                        <p className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-gray-400 sm:mt-0 sm:text-xs">{barangayCount} BRGYS</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* System Guarantees & Notice */}
                <aside
                    data-testid="system-guarantees"
                    className="border-t border-white/15 pt-8 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 xl:pl-14"
                >
                    <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300">System guarantees</p>
                    <h3 className="mt-1.5 font-display text-lg font-bold text-white">Built for accountability.</h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-300">
                        Every incident record passes through a structured review and response chain before public visibility.
                    </p>

                    <div className="mt-4 sm:mt-5">
                        <ul className="flex flex-col gap-2" role="list">
                            {TRUST_ITEMS.map((text) => (
                                <li key={text} className="flex items-start gap-2.5">
                                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-xs leading-relaxed text-slate-300">{text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default Coverage;
