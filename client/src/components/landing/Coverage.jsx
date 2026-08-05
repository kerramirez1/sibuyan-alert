import { HiOutlineShieldCheck, HiOutlineLocationMarker, HiOutlineUserCircle, HiOutlineRefresh, HiOutlineLockClosed } from 'react-icons/hi';

const TRUST_ITEMS = [
    { Icon: HiOutlineShieldCheck, text: 'Municipal administrator review before public visibility' },
    { Icon: HiOutlineLocationMarker, text: 'GPS-based incident location with barangay verification' },
    { Icon: HiOutlineUserCircle, text: 'Reporter identity verified before account approval' },
    { Icon: HiOutlineRefresh, text: 'Real-time status updates across the full lifecycle' },
    { Icon: HiOutlineLockClosed, text: 'Secure, role-based access for each user type' },
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
                    <p className="mb-8 mt-4 max-w-xl text-sm leading-relaxed text-emerald-50/65">The platform serves the island's three municipalities while keeping report visibility, administration, and response responsibilities properly scoped.</p>

                    <div className="mb-8 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                        {[
                            [municipalities.length, 'Municipalities'],
                            [totalBarangays, 'Barangays'],
                            [4, 'Response agencies'],
                        ].map(([value, label], index) => (
                            <div key={label} className={`min-w-0 px-2 py-4 text-center sm:px-4 ${index === 1 ? 'border-x border-white/10' : ''}`}>
                                <p className="text-xl font-black tabular-nums text-white sm:text-2xl">{value}</p>
                                <p className="mt-1 text-[9px] font-semibold leading-tight text-emerald-50/50 sm:text-xs">{label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                        {municipalities.map((municipality) => {
                            const logo = logoConfig[municipality.name];
                            const barangayCount = municipality.barangays?.length || fallbackBarangayCount(municipality.name);
                            return (
                                <div key={municipality.code} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                                        {logo
                                            ? <img src={logo.src} alt={`${municipality.name} seal`} className={`h-full w-full object-contain ${logo.scale}`} />
                                            : <span className="font-bold text-emerald-900">{municipality.name[0]}</span>}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-white">{municipality.name}</p>
                                        <p className="mt-0.5 text-xs text-emerald-50/50">{barangayCount} barangays</p>
                                    </div>
                                    <HiOutlineShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Covered" />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Trust + disclaimer block ─────────────────────────────── */}
                <aside className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 lg:sticky lg:top-24">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">System guarantees</p>
                    <h3 className="mt-4 text-xl font-black text-white">Built for accountability.</h3>
                    <p className="mt-2 text-sm leading-relaxed text-emerald-50/60">
                        Every incident record passes through a structured review and response chain before public visibility.
                    </p>

                    <ul className="mt-6 space-y-3.5" role="list">
                        {TRUST_ITEMS.map(({ Icon, text }) => (
                            <li key={text} className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                                <span className="text-sm leading-snug text-emerald-50/70">{text}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-7 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                        <p className="text-xs leading-relaxed text-amber-200/80">
                            <strong className="font-bold text-amber-300">Emergency notice:</strong>{' '}
                            Sibuyan Alert supports accident reporting and coordination. For immediate life-threatening emergencies, contact the appropriate official emergency service directly.
                        </p>
                    </div>
                </aside>
            </div>
        </section>
    );
};

export default Coverage;
