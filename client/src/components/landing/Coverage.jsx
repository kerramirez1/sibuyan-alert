import { HiOutlineCheckCircle } from 'react-icons/hi';

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

const fallbackBarangayCount = (name) => name === 'Cajidiocan' ? 14 : name === 'Magdiwang' ? 9 : 12;

const Coverage = ({ municipalities }) => {
    const totalBarangays = municipalities.reduce(
        (total, municipality) => total + (municipality.barangays?.length || fallbackBarangayCount(municipality.name)),
        0
    );

    return (
        <section className="bg-[#071b13] px-5 py-20 text-white sm:px-8 sm:py-24">
            <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.72fr)] lg:gap-16 xl:gap-24">
                <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-400">Coverage</p>
                    <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Connected across Sibuyan Island.</h2>
                    <p className="mb-8 mt-4 max-w-xl text-sm leading-relaxed text-emerald-50/75">The platform serves the island's three municipalities while keeping report visibility, administration, and response responsibilities properly scoped.</p>

                    <dl
                        data-testid="coverage-metrics"
                        aria-label="Island coverage totals"
                        className="mb-9 grid grid-cols-3 border-y border-white/15"
                    >
                        {[
                            [municipalities.length, 'Municipalities'],
                            [totalBarangays, 'Barangays'],
                            [4, 'Response agencies'],
                        ].map(([value, label], index) => (
                            <div
                                key={label}
                                className={`flex min-w-0 flex-col py-5 ${index > 0 ? 'border-l border-white/15 pl-3 sm:pl-5' : 'pr-3 sm:pr-5'}`}
                            >
                                <dt className="order-2 mt-1 text-[11px] font-semibold leading-snug text-emerald-50/75 sm:text-xs">{label}</dt>
                                <dd className="order-1 text-2xl font-black tabular-nums text-white sm:text-3xl">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    <ul
                        data-testid="municipality-coverage-list"
                        aria-label="Municipalities covered"
                        className="divide-y divide-white/15 border-y border-white/15"
                    >
                        {municipalities.map((municipality) => {
                            const logo = logoConfig[municipality.name];
                            const barangayCount = municipality.barangays?.length || fallbackBarangayCount(municipality.name);
                            return (
                                <li key={municipality.code} className="flex min-w-0 items-center gap-4 py-4 sm:py-5">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden p-1 sm:h-12 sm:w-12">
                                        {logo
                                            ? <img src={logo.src} alt={`${municipality.name} seal`} className={`h-full w-full object-contain ${logo.scale}`} />
                                            : <span className="text-lg font-bold text-emerald-100">{municipality.name[0]}</span>}
                                    </span>
                                    <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                                        <p className="truncate text-sm font-bold text-white">{municipality.name}</p>
                                        <p className="mt-1 shrink-0 text-xs font-medium text-emerald-50/70 sm:mt-0">{barangayCount} barangays</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* ── Trust + disclaimer block ─────────────────────────────── */}
                <aside
                    data-testid="system-guarantees"
                    className="border-t border-white/15 pt-10 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0 xl:pl-16"
                >
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">System guarantees</p>
                    <h3 className="mt-3 text-xl font-black text-white">Built for accountability.</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-50/75">
                        Every incident record passes through a structured review and response chain before public visibility.
                    </p>

                    <ul className="mt-7 divide-y divide-white/10 border-y border-white/15" role="list">
                        {TRUST_ITEMS.map((text) => (
                            <li key={text} className="flex items-start gap-3 py-3.5">
                                <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                <span className="text-sm leading-relaxed text-emerald-50/85">{text}</span>
                            </li>
                        ))}
                    </ul>

                    <div data-testid="coverage-emergency-notice" className="mt-7 border-l-2 border-emerald-400/50 pl-4">
                        <p className="text-xs leading-relaxed text-emerald-50/80">
                            <strong className="font-bold text-emerald-300">Emergency notice:</strong>{' '}
                            Sibuyan Alert supports accident reporting and coordination. For immediate life-threatening emergencies, contact the appropriate official emergency service directly.
                        </p>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default Coverage;
