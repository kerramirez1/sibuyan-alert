import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
    HiOutlineMap,
    HiOutlineShieldCheck,
    HiOutlineBell,
    HiOutlineUserGroup,
    HiOutlineArrowRight,
    HiOutlineLocationMarker,
    HiOutlineLightningBolt,
    HiOutlineChartBar,
    HiOutlineDocumentText,
    HiOutlineClipboardCheck,
} from 'react-icons/hi';
import { reportsAPI, highRiskZonesAPI, analyticsAPI } from '../services/api';
import Modal from '../components/ui/Modal';

// Step card for "How it Works"
const StepCard = ({ number, icon: Icon, title, desc, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.6 }}
        className="relative flex flex-col items-center text-center p-8 rounded-3xl bg-white border-2 border-gray-100 shadow-lg hover:shadow-2xl hover:border-blue-100 transition-all duration-300 group"
    >
        {/* Step number badge */}
        <div className={`absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full ${color} text-white text-sm font-black flex items-center justify-center shadow-lg`}>
            {number}
        </div>
        <div className={`w-16 h-16 rounded-2xl ${color} bg-opacity-10 flex items-center justify-center mb-5 mt-3 group-hover:scale-110 transition-transform shadow-md`}>
            <Icon className={`w-8 h-8 ${color.replace('bg-', 'text-')}`} />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{desc}</p>
    </motion.div>
);

const HomePage = () => {
    const { isAuthenticated, user } = useAuth();
    const { subscribe } = useSocket();
    const [municipalities, setMunicipalities] = useState([
        { name: 'Cajidiocan', code: 'CAJ', barangays: [] },
        { name: 'Magdiwang', code: 'MAG', barangays: [] },
        { name: 'San Fernando', code: 'SAF', barangays: [] }
    ]);
    const [showHighRiskModal, setShowHighRiskModal] = useState(false);
    const [highRiskZones, setHighRiskZones] = useState([]);
    const [loadingHighRisk, setLoadingHighRisk] = useState(false);
    const refreshDebounceRef = useRef(null);

    const fetchHighRiskZones = useCallback(async () => {
        setLoadingHighRisk(true);
        try {
            const response = await highRiskZonesAPI.getAll();
            if (response.data.success) {
                setHighRiskZones(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch high risk zones:', error);
        } finally {
            setLoadingHighRisk(false);
        }
    }, []);

    const [publicStats, setPublicStats] = useState(null);

    const fetchPublicStats = useCallback(async () => {
        try {
            const res = await analyticsAPI.getPublic();
            if (res.data.success) {
                const payload = res.data.data || {};
                setPublicStats({
                    verifiedReportsThisMonth: payload.verifiedReportsThisMonth ?? payload.verifiedThisMonth ?? 0,
                    activeHighRiskZones: payload.activeHighRiskZones ?? 0,
                    totalReportsAllTime: payload.totalReportsAllTime ?? 0,
                    systemStatus: payload.systemStatus || 'Operational',
                });
            }
        } catch (err) {
            console.error('Failed to fetch public analytics', err);
            // Fallback: derive basic analytics from available public endpoints
            try {
                const [statsRes, zonesRes] = await Promise.all([
                    reportsAPI.getStats(),
                    highRiskZonesAPI.getAll(),
                ]);

                const stats = statsRes.data?.data || {};
                const zones = zonesRes.data?.data || [];

                setPublicStats({
                    verifiedReportsThisMonth: stats.reportsLast30Days || 0,
                    activeHighRiskZones: zones.length,
                    totalReportsAllTime: stats.totalReports || 0,
                    systemStatus: 'Operational',
                });
            } catch (fallbackErr) {
                console.error('Fallback public analytics fetch failed', fallbackErr);
                setPublicStats({
                    verifiedReportsThisMonth: 0,
                    activeHighRiskZones: 0,
                    totalReportsAllTime: 0,
                    systemStatus: 'Operational',
                });
            }
        }
    }, []);

    useEffect(() => {
        fetchPublicStats();
    }, [fetchPublicStats]);

    useEffect(() => {
        if (!showHighRiskModal) return;
        fetchHighRiskZones();
    }, [showHighRiskModal, fetchHighRiskZones]);

    useEffect(() => {
        const scheduleRefreshPublicData = () => {
            if (refreshDebounceRef.current) {
                clearTimeout(refreshDebounceRef.current);
            }
            refreshDebounceRef.current = setTimeout(() => {
                fetchPublicStats();
                if (showHighRiskModal) {
                    fetchHighRiskZones();
                }
            }, 400);
        };

        const unsub1 = subscribe('newReport', scheduleRefreshPublicData);
        const unsub2 = subscribe('reportVerified', scheduleRefreshPublicData);
        const unsub3 = subscribe('reportResolved', scheduleRefreshPublicData);
        const unsub4 = subscribe('reportDeleted', scheduleRefreshPublicData);
        const unsub5 = subscribe('highRiskZoneCreated', scheduleRefreshPublicData);
        const unsub6 = subscribe('highRiskZoneUpdated', scheduleRefreshPublicData);
        const unsub7 = subscribe('highRiskZoneDeleted', scheduleRefreshPublicData);

        return () => {
            if (refreshDebounceRef.current) {
                clearTimeout(refreshDebounceRef.current);
                refreshDebounceRef.current = null;
            }
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub5();
            unsub6();
            unsub7();
        };
    }, [subscribe, fetchPublicStats, fetchHighRiskZones, showHighRiskModal]);

    useEffect(() => {
        const fetchMunicipalities = async () => {
            try {
                const response = await reportsAPI.getMunicipalities();
                if (response.data.success && response.data.data.length > 0) {
                    setMunicipalities(response.data.data);
                }
            } catch (error) {
                console.error('Failed to fetch municipalities:', error);
            }
        };
        fetchMunicipalities();
    }, []);

    const features = [
        {
            icon: HiOutlineMap,
            title: 'Live Surveillance',
            description: 'Real-time interactive map tracking accidents across all municipalities with pinpoint accuracy.',
            color: 'bg-blue-50 text-blue-600',
        },
        {
            icon: HiOutlineShieldCheck,
            title: 'Verified Reports',
            description: 'Community-driven reporting system verified by local authorities for maximum reliability.',
            color: 'bg-emerald-50 text-emerald-600',
        },
        {
            icon: HiOutlineBell,
            title: 'Instant Alerts',
            description: 'Receive immediate notifications about emergency situations in your vicinity.',
            color: 'bg-orange-50 text-orange-600',
        },
        {
            icon: HiOutlineChartBar,
            title: 'Data Analytics',
            description: 'Comprehensive insights and trends to help improve safety measures and response times.',
            color: 'bg-purple-50 text-purple-600',
        },
    ];

    const steps = [
        {
            number: '1',
            icon: HiOutlineDocumentText,
            title: 'Submit a Report',
            desc: 'Verified reporters submit accident details — location, photos, severity, and type.',
            color: 'bg-blue-500',
            delay: 0,
        },
        {
            number: '2',
            icon: HiOutlineClipboardCheck,
            title: 'Admin Verifies',
            desc: 'Municipal admins review and verify reports before broadcasting to responders.',
            color: 'bg-emerald-500',
            delay: 0.15,
        },
        {
            number: '3',
            icon: HiOutlineShieldCheck,
            title: 'Responders Act',
            desc: 'BFP, PNP, MDRRMO, and SDH receive instant alerts and respond to the scene.',
            color: 'bg-orange-500',
            delay: 0.3,
        },
    ];

    return (
        <div
            className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed font-sans selection:bg-brand-200 selection:text-brand-900"
            style={{
                backgroundImage: "linear-gradient(rgba(249,250,251,0.18), rgba(249,250,251,0.28)), url('/images/sibuyan-hero.jpg')",
            }}
        >
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-1 sm:gap-3 group">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <img src="/icons/Alert.png" alt="Sibuyan Alert Logo" className="w-full h-full object-contain" />
                        </div>
                        <span className="font-display font-bold text-lg sm:text-2xl text-gray-900 tracking-tight">
                            Sibuyan <span className="text-brand-600 hidden xs:inline">Alert</span>
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {isAuthenticated ? (
                            <Link
                                to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'}
                                className="flex items-center gap-2 px-4 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-xl hover:shadow-2xl shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-95 text-xs sm:text-base"
                            >
                                <span className="hidden xs:inline">
                                    {user?.role === 'reporter' ? 'Go to My Reports' : 'Go to Analytics Dashboard'}
                                </span>
                                <span className="xs:hidden">
                                    {user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}
                                </span>
                                <HiOutlineArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                            </Link>
                        ) : (
                            <div className="flex items-center gap-2 sm:gap-4">
                                <Link
                                    to="/login"
                                    className="px-4 sm:px-6 py-2.5 sm:py-3 text-gray-700 hover:text-brand-600 font-bold transition-all rounded-xl hover:bg-brand-50 text-xs sm:text-base"
                                >
                                    Sign In
                                </Link>
                                <Link
                                    to="/register"
                                    className="px-5 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl font-bold hover:from-gray-800 hover:to-gray-700 transition-all shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-95 text-xs sm:text-base whitespace-nowrap"
                                >
                                    <span className="hidden xs:inline">Become a Reporter</span>
                                    <span className="xs:hidden">Join Now</span>
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 overflow-hidden">

                {/* Abstract Background Elements */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-brand-50 rounded-full blur-3xl z-[1] opacity-60 pointer-events-none" />
                <div className="absolute top-20 right-0 w-96 h-96 bg-blue-50 rounded-full blur-3xl z-[1] opacity-60 pointer-events-none" />

                <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-brand-700 text-sm font-medium mb-8 shadow-sm">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                            </span>
                            Accident Alert & Mapping System
                        </div>

                        <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-bold text-gray-900 mb-8 tracking-tight">
                            Accident Alert & Mapping <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-emerald-500">
                                System for Sibuyan Island
                            </span>
                        </h1>

                        <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-4 leading-relaxed">
                            The system allows public access to the map for safety awareness while restricting reporting and response functions to authorized users only.
                        </p>

                        <p className="text-sm text-gray-400 max-w-xl mx-auto mb-10">
                            View live accidents & high-risk zones freely. Register as a reporter to contribute and access advanced tools.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 mt-10">
                            <Link
                                to="/dashboard?view=map"
                                className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-base sm:text-lg shadow-2xl shadow-blue-500/40 flex items-center justify-center gap-3 transform hover:scale-[1.05] active:scale-95 transition-all"
                            >
                                <HiOutlineMap className="w-6 h-6 sm:w-7 sm:h-7" />
                                <span>View Live Map</span>
                            </Link>
                            {!isAuthenticated && (
                                <Link
                                    to="/register"
                                    className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-white text-gray-900 border-2 border-gray-300 rounded-2xl font-bold text-base sm:text-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-2 transform hover:scale-[1.02]"
                                >
                                    Become a Reporter
                                </Link>
                            )}
                        </div>

                        {/* Public Analytics Bar */}
                        {publicStats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mt-10">
                                <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-gray-100 shadow-xl flex flex-col items-center justify-center transform hover:-translate-y-1 transition-all">
                                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                                        <HiOutlineShieldCheck className="w-5 h-5" />
                                    </div>
                                    <span className="text-2xl font-black text-gray-900">{publicStats.verifiedReportsThisMonth || 0}</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Verified Reports <br />(This Month)</span>
                                </div>
                                <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-gray-100 shadow-xl flex flex-col items-center justify-center transform hover:-translate-y-1 transition-all">
                                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-2">
                                        <HiOutlineLocationMarker className="w-5 h-5" />
                                    </div>
                                    <span className="text-2xl font-black text-gray-900">{publicStats.activeHighRiskZones || 0}</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Active <br />High-Risk Zones</span>
                                </div>
                                <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-gray-100 shadow-xl flex flex-col items-center justify-center transform hover:-translate-y-1 transition-all">
                                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                                        <HiOutlineChartBar className="w-5 h-5" />
                                    </div>
                                    <span className="text-2xl font-black text-gray-900">{publicStats.totalReportsAllTime || 0}</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Total Incidents <br />Resolved</span>
                                </div>
                                <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-gray-100 shadow-xl flex flex-col items-center justify-center transform hover:-translate-y-1 transition-all">
                                    <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center mb-2">
                                        <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse"></div>
                                    </div>
                                    <span className="text-lg font-black text-gray-900 mt-1 capitalize">{publicStats.systemStatus || 'Operational'}</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center mt-1">System <br />Status</span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            </section>

            {/* ─── How It Works ─── */}
            <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
                <div className="max-w-7xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <span className="inline-block px-4 py-1 bg-brand-50 text-brand-700 text-sm font-bold rounded-full mb-4 border border-brand-100">How It Works</span>
                        <h2 className="text-2xl sm:text-4xl font-display font-bold text-gray-900 mb-4">
                            From Report to Response
                        </h2>
                        <p className="text-gray-500 max-w-xl mx-auto text-base sm:text-lg">
                            A streamlined 3-step process connecting community reporters with emergency responders.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-6 relative">
                        {/* Connecting line (desktop) */}
                        <div className="hidden md:block absolute top-[4.5rem] left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-0.5 bg-gradient-to-r from-blue-200 via-emerald-200 to-orange-200 z-0"></div>
                        {steps.map((step) => (
                            <StepCard key={step.number} {...step} />
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-4">
                            Powerful Tools for Community Safety
                        </h2>
                        <p className="text-gray-500 max-w-2xl mx-auto text-base sm:text-lg">
                            Equipping citizens and authorities with state-of-the-art technology to coordinate effective emergency response.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                className="p-8 rounded-3xl bg-white border-2 border-gray-100 hover:border-blue-200 hover:shadow-2xl transition-all duration-300 group transform hover:scale-[1.02]"
                            >
                                <div className={`w-16 h-16 rounded-2xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 shadow-lg transition-all`}>
                                    <feature.icon className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats/Municipality Section */}
            <section className="py-24 bg-gray-900 text-white overflow-hidden relative">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    {/* Section Header */}
                    <div className="mb-16 md:text-center max-w-3xl mx-auto">
                        <h2 className="text-2xl sm:text-4xl font-display font-bold mb-6">
                            Coverage Across Sibuyan
                        </h2>
                        <p className="text-gray-400 text-base sm:text-lg">
                            Promoting safety and rapid response across all municipalities. We work directly with local Barangays to verify reports and coordinate assistance.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
                        {/* Municipality List */}
                        <div className="space-y-4">
                            {municipalities.map((muni) => {
                                // Logo configuration to ensure visual consistency
                                const logoConfig = {
                                    'Cajidiocan': { src: '/icons/Cajidiocan.logo.png', scale: 'scale-150' },
                                    'Magdiwang': { src: '/icons/Magdiwang.logo.png', scale: 'scale-150' },
                                    'San Fernando': { src: '/icons/Sanfernando.logo.png', scale: 'scale-75' },
                                }[muni.name] || null;

                                return (
                                    <motion.div
                                        key={muni.code}
                                        initial={{ opacity: 0, x: -20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        className="flex items-center gap-5 p-6 rounded-2xl bg-white/10 border-2 border-white/20 hover:bg-white/15 hover:border-white/30 transition-all group backdrop-blur-sm shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                                    >
                                        <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center p-1 border-2 border-white/20 overflow-hidden group-hover:scale-110 transition-transform shadow-md">
                                            {logoConfig ? (
                                                <img
                                                    src={logoConfig.src}
                                                    alt={`${muni.name} Logo`}
                                                    className={`w-full h-full object-contain ${logoConfig.scale}`}
                                                />
                                            ) : (
                                                <span className="text-brand-400 font-bold text-lg">
                                                    {muni.name.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-lg sm:text-xl mb-1 group-hover:text-brand-300 transition-colors">{muni.name}</h4>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                                                <p className="text-xs sm:text-sm text-gray-300 font-semibold">
                                                    {muni.barangays?.length > 0 ? muni.barangays.length : (
                                                        muni.name === 'Cajidiocan' ? 14 :
                                                            muni.name === 'Magdiwang' ? 9 :
                                                                muni.name === 'San Fernando' ? 13 : 0
                                                    )} Barangays Active
                                                </p>
                                            </div>
                                        </div>
                                        <HiOutlineArrowRight className="w-6 h-6 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Join Network CTA */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-gradient-to-br from-brand-600 to-emerald-600 rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-12 -mt-12 blur-3xl"></div>
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full -ml-8 -mb-8 blur-2xl"></div>

                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-8 border border-white/10">
                                    <HiOutlineUserGroup className="w-7 h-7 text-white" />
                                </div>

                                {isAuthenticated ? (
                                    <>
                                        <h3 className="text-2xl sm:text-3xl font-display font-bold mb-4">Welcome Back!</h3>
                                        <p className="text-brand-100 text-base sm:text-lg mb-10 leading-relaxed">
                                            You're already part of the network. Head to your dashboard to view reports, analytics, and more.
                                        </p>
                                        <Link to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'} className="block w-full py-4 sm:py-5 bg-white text-brand-700 font-bold text-base sm:text-lg text-center rounded-2xl hover:bg-brand-50 transition-all shadow-2xl shadow-black/20 transform hover:scale-[1.02]">
                                            {user?.role === 'reporter' ? 'Go to My Reports' : 'Go to Dashboard'}
                                        </Link>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-2xl sm:text-3xl font-display font-bold mb-4">Join the Network</h3>
                                        <p className="text-brand-100 text-base sm:text-lg mb-10 leading-relaxed">
                                            Get verified status to submit reports, access real-time analytics, and help save lives in your community.
                                        </p>
                                        <Link to="/register" className="block w-full py-4 sm:py-5 bg-white text-brand-700 font-bold text-base sm:text-lg text-center rounded-2xl hover:bg-brand-50 transition-all shadow-2xl shadow-black/20 transform hover:scale-[1.02]">
                                            Register Now
                                        </Link>
                                        <p className="text-xs text-center text-brand-200 mt-6 font-medium tracking-wide uppercase">
                                            Verification takes less than 2 minutes
                                        </p>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* High Risk Zones Modal */}
            <Modal
                isOpen={showHighRiskModal}
                onClose={() => setShowHighRiskModal(false)}
                title="Active High Risk Zones"
                size="lg"
            >
                {loadingHighRisk ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="w-10 h-10 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin"></div>
                    </div>
                ) : highRiskZones.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <HiOutlineShieldCheck className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No Active Zones</h3>
                        <p className="text-gray-500">There are currently no high-risk zones reported in Sibuyan Island.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {highRiskZones.map((zone) => (
                            <div
                                key={zone._id}
                                className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-brand-200 hover:shadow-md transition-all group"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${zone.severity === 'critical' ? 'bg-red-50 text-red-600 border-red-200' :
                                                zone.severity === 'high' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                                    zone.severity === 'medium' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                                                        'bg-blue-50 text-blue-600 border-blue-200'
                                                }`}>
                                                {zone.severity}
                                            </span>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                {zone.municipality}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-gray-900 text-lg group-hover:text-brand-700 transition-colors">
                                            {zone.name}
                                        </h4>
                                        <p className="text-gray-600 text-sm mt-1 leading-relaxed">
                                            {zone.description}
                                        </p>
                                        <div className="flex items-center gap-4 mt-3 text-xs font-medium text-gray-400">
                                            <div className="flex items-center gap-1.5">
                                                <HiOutlineLightningBolt className="w-4 h-4" />
                                                <span>{zone.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <HiOutlineLocationMarker className="w-4 h-4" />
                                                <span>{zone.radius}m Radius</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${zone.severity === 'critical' ? 'bg-red-100 text-red-600 border-red-200' :
                                        zone.severity === 'high' ? 'bg-orange-100 text-orange-600 border-orange-200' :
                                            zone.severity === 'medium' ? 'bg-yellow-100 text-yellow-600 border-yellow-200' :
                                                'bg-blue-100 text-blue-600 border-blue-200'
                                        }`}>
                                        <HiOutlineMap className="w-6 h-6" />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <Link
                                to="/dashboard?view=map"
                                className="w-full flex items-center justify-center gap-2 py-3 bg-brand-50 text-brand-700 font-bold rounded-xl hover:bg-brand-100 transition-colors"
                            >
                                <HiOutlineMap className="w-5 h-5" />
                                View Zones on Map
                            </Link>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Simple Footer */}
            <footer className="bg-white border-t border-gray-100 py-12">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center">
                            <img src="/icons/Alert.png" alt="Sibuyan Alert Logo" className="w-full h-full object-contain" />
                        </div>
                        <span className="font-display font-bold text-lg text-gray-900">Sibuyan Alert</span>
                    </div>
                    <p className="text-gray-500 text-sm">
                        &copy; 2026 Sibuyan Alert System. All rights reserved.
                    </p>
                    <div className="flex gap-6">
                        <button onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-gray-400 hover:text-brand-600 transition-colors">Privacy</button>
                        <button onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-gray-400 hover:text-brand-600 transition-colors">Terms</button>
                        <button onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-gray-400 hover:text-brand-600 transition-colors">Contact</button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
