import { Link } from '../../router';
import { HiOutlineArrowRight, HiOutlineShieldCheck } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';

const logoConfig = {
    Cajidiocan: { src: '/icons/Cajidiocan.logo.png', scale: 'scale-150' },
    Magdiwang: { src: '/icons/Magdiwang.logo.png', scale: 'scale-150' },
    'San Fernando': { src: '/icons/Sanfernando.logo.png', scale: 'scale-75' },
};

const fallbackBarangayCount = (name) => name === 'Cajidiocan' ? 14 : name === 'Magdiwang' ? 9 : 12;

const Coverage = ({ municipalities, userRole }) => {
    const { isAuthenticated } = useAuth();
    const destination = userRole === 'reporter' ? '/my-reports' : '/dashboard';
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

                <aside className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl sm:p-8 lg:sticky lg:top-24">
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">{isAuthenticated ? 'Your account' : 'Community access'}</p>
                    <h3 className="mt-5 text-2xl font-black text-white">{isAuthenticated ? 'Continue to your workspace.' : 'Help keep Sibuyan informed.'}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-emerald-50/60">
                        {isAuthenticated
                            ? 'Open your role-appropriate workspace to review reports, maps, alerts, and response activity.'
                            : 'Create a verified reporter account to submit accurate incident details and monitor your reports.'}
                    </p>
                    <Link to={isAuthenticated ? destination : '/register'} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-950 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b13]">
                        {isAuthenticated ? 'Open workspace' : 'Become a reporter'}
                        <HiOutlineArrowRight className="h-4 w-4" />
                    </Link>
                    {!isAuthenticated && <p className="mt-4 text-center text-xs text-emerald-50/45">Already registered? <Link to="/login" className="font-bold text-emerald-300 hover:text-emerald-200">Sign in</Link></p>}
                </aside>
            </div>
        </section>
    );
};

export default Coverage;
