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

const fallbackBarangayCount = (name) => (name === 'Cajidiocan' ? 14 : name === 'Magdiwang' ? 9 : 12);

const Coverage = ({ municipalities }) => {
    const totalBarangays = municipalities.reduce(
        (total, municipality) => total + (municipality.barangays?.length || fallbackBarangayCount(municipality.name)),
        0
    );

    return (
        <section className="relative isolate bg-[#06150f] px-5 py-16 text-white sm:px-8 sm:py-20 dark:bg-[#040d0a]">
            <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.72fr)] lg:gap-14 xl:gap-20">
                <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-400">Coverage</p>
                    <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Connected across Sibuyan Island.</h2>
                    <p className="mb-7 mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-emerald-50/75">
                        The platform serves the island&apos;s three municipalities while keeping report visibility, administration, and response responsibilities properly scoped.
                    </p>

                    {/* Metric tiles — flat editorial grid with hairline dividers.
                        BFP is excluded from the agency count: fire response is
                        outside this system's operational scope. */}
                    <dl
                        data-testid="coverage-metrics"
                        aria-label="Island coverage totals"
                        className="mb-8 grid max-w-md grid-cols-3 divide-x divide-green-900/50"
                    >
                        {[
                            [municipalities.length, 'Municipalities'],
                            [totalBarangays, 'Barangays'],
                            [3, 'Agencies'],
                        ].map(([value, label]) => (
                            <div
                                key={label}
                                className="flex min-w-0 flex-col p-3 text-left sm:p-5"
                            >
                                <dt className="order-2 mt-1 text-[9px] font-bold uppercase tracking-wide text-emerald-50/60 sm:text-[11px] sm:tracking-widest">{label}</dt>
                                <dd className="order-1 font-mono text-xl font-black tabular-nums text-white sm:text-3xl">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {/* Municipality List — flat ledger with hairline row dividers */}
                    <ul
                        data-testid="municipality-coverage-list"
                        aria-label="Municipalities covered"
                        className="flex flex-col"
                    >
                        {municipalities.map((municipality) => {
                            const logo = logoConfig[municipality.name];
                            const barangayCount = municipality.barangays?.length || fallbackBarangayCount(municipality.name);
                            return (
                                <li
                                    key={municipality.code}
                                    className="flex min-w-0 items-center gap-3 border-b border-green-900/50 px-1 py-3 sm:gap-4 sm:px-2 sm:py-3.5"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden p-1 sm:h-11 sm:w-11">
                                        {logo
                                            ? <img src={logo.src} alt={`${municipality.name} seal`} className={`h-full w-full object-contain opacity-90 ${logo.scale}`} />
                                            : <span className="text-base font-bold text-emerald-100">{municipality.name[0]}</span>}
                                    </span>
                                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-6">
                                        <div className="flex items-center gap-2.5">
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                                            <p className="truncate text-xs sm:text-sm font-bold uppercase tracking-wider text-white">{municipality.name}</p>
                                        </div>
                                        <p className="mt-0.5 shrink-0 font-mono text-xs font-semibold text-gray-400 sm:mt-0 sm:text-sm">{barangayCount} BRGYS</p>
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
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">System guarantees</p>
                    <h3 className="mt-2 font-display text-xl font-bold text-white">Built for accountability.</h3>
                    <p className="mt-1.5 max-w-md text-xs sm:text-sm leading-relaxed text-emerald-50/75">
                        Every incident record passes through a structured review and response chain before public visibility.
                    </p>

                    <div className="mt-5 sm:mt-6">
                        <ul className="flex flex-col gap-3" role="list">
                            {TRUST_ITEMS.map((text) => (
                                <li key={text} className="flex items-start gap-3">
                                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-xs sm:text-sm leading-relaxed text-emerald-50/85">{text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div data-testid="coverage-emergency-notice" className="mt-6 rounded-none border-l-4 border-amber-500 bg-amber-500/10 p-4">
                        <div className="flex gap-3">
                            <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-xs leading-relaxed text-amber-100/85">
                                <strong className="mb-0.5 block font-bold text-amber-500">Important Notice</strong>
                                Sibuyan Alert supports accident reporting and coordination. For immediate life-threatening emergencies, contact the appropriate official emergency service directly.
                            </p>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default Coverage;
