import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HiOutlineShieldCheck, HiOutlineArrowRight } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';

const logoConfig = {
    Cajidiocan: { src: '/icons/Cajidiocan.logo.png', scale: 'scale-150' },
    Magdiwang: { src: '/icons/Magdiwang.logo.png', scale: 'scale-150' },
    'San Fernando': { src: '/icons/Sanfernando.logo.png', scale: 'scale-75' },
};

const barangayCount = (name) => name === 'Cajidiocan' ? 14 : name === 'Magdiwang' ? 9 : 12;

const CoverageItem = ({ muni }) => {
    const logo = logoConfig[muni.name];
    const count = muni.barangays?.length > 0 ? muni.barangays.length : barangayCount(muni.name);

    return (
        <motion.div
            key={muni.code}
            className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            whileHover={{ x: 4 }}
        >
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1">
                {logo
                    ? <img src={logo.src} alt={muni.name} className={`w-full h-full object-contain ${logo.scale}`} />
                    : <span className="text-white font-bold text-sm">{muni.name[0]}</span>}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-[14px] text-white">{muni.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{count} barangays</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                <HiOutlineShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">Covered</span>
            </div>
        </motion.div>
    );
};

const CTACard = ({ isAuthenticated, userRole }) => {
    const destPath = userRole === 'reporter' ? '/my-reports' : '/dashboard';

    return (
        <motion.div
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-8"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
        >
            {isAuthenticated ? (
                <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-6">Your account</p>
                    <h3 className="text-xl font-bold text-white mb-2">Welcome back.</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8">
                        Head to your dashboard to review live incidents, analytics, and response activity.
                    </p>
                    <Link
                        to={destPath}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-white text-gray-900 font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Go to {userRole === 'reporter' ? 'My Reports' : 'Dashboard'}
                        <HiOutlineArrowRight className="w-4 h-4" />
                    </Link>
                </>
            ) : (
                <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-6">Get access</p>
                    <h3 className="text-xl font-bold text-white mb-2">Join the network.</h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-8">
                        Register as a verified reporter to submit incidents, receive alerts, and help keep Sibuyan Island safe.
                    </p>
                    <Link
                        to="/register"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-white text-gray-900 font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        Create an account
                        <HiOutlineArrowRight className="w-4 h-4" />
                    </Link>
                    <p className="text-center text-xs text-gray-600 mt-4">
                        Already registered?{' '}
                        <Link to="/login" className="text-gray-400 hover:text-white transition-colors font-medium">Sign in</Link>
                    </p>
                </>
            )}
        </motion.div>
    );
};

const Coverage = ({ municipalities, userRole }) => {
    const { isAuthenticated } = useAuth();
    const totalBarangayCount = municipalities.reduce(
        (total, muni) => total + (muni.barangays?.length || barangayCount(muni.name)),
        0
    );

    return (
        <section className="py-24 px-5 sm:px-8 bg-gray-950 text-white">
            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 xl:gap-24 items-start">
                <div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Coverage</p>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
                            Active across all of Sibuyan Island.
                        </h2>
                        <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-sm">
                            Coordinating with barangay councils and response agencies for rapid, verified incident management island-wide.
                        </p>

                        <div className="flex items-center gap-6 mb-10 pb-8 border-b border-white/[0.06]">
                            <div>
                                <p className="text-2xl font-bold text-white tabular-nums">3</p>
                                <p className="text-xs text-gray-500 mt-0.5">Municipalities</p>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div>
                                <p className="text-2xl font-bold text-white tabular-nums">{totalBarangayCount}</p>
                                <p className="text-xs text-gray-500 mt-0.5">Barangays covered</p>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div>
                                <p className="text-2xl font-bold text-white tabular-nums">4</p>
                                <p className="text-xs text-gray-500 mt-0.5">Response agencies</p>
                            </div>
                        </div>
                    </motion.div>

                    <div className="space-y-2">
                        {municipalities.map((muni) => (
                            <CoverageItem key={muni.code} muni={muni} />
                        ))}
                    </div>
                </div>

                <div className="lg:sticky lg:top-24">
                    <CTACard isAuthenticated={isAuthenticated} userRole={userRole} />
                </div>
            </div>
        </section>
    );
};

export default Coverage;