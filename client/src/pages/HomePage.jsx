import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
    HiOutlineMap,
    HiOutlineShieldCheck,
    HiOutlineBell,
    HiOutlineArrowRight,
    HiOutlineLocationMarker,
    HiOutlineLightningBolt,
    HiOutlineChartBar,
    HiOutlineDocumentText,
    HiOutlineClipboardCheck,
} from 'react-icons/hi';
import { reportsAPI, highRiskZonesAPI, analyticsAPI } from '../services/api';
import Modal from '../components/ui/Modal';

const getVerifiedPeriodLabel = (period) => {
    if (!period?.startAt) return 'Verified this month';

    const startAt = new Date(period.startAt);
    if (Number.isNaN(startAt.getTime())) return 'Verified this month';

    try {
        return `Verified in ${new Intl.DateTimeFormat('en-PH', {
            month: 'short',
            year: 'numeric',
            timeZone: period.timezone || 'Asia/Manila',
        }).format(startAt)}`;
    } catch {
        return 'Verified this month';
    }
};

const HomePage = () => {
    const { isAuthenticated, user } = useAuth();
    const { subscribe } = useSocket();
    const [municipalities, setMunicipalities] = useState([
        { name: 'Cajidiocan', code: 'CAJ', barangays: [] },
        { name: 'Magdiwang', code: 'MAG', barangays: [] },
        { name: 'San Fernando', code: 'SFN', barangays: [] },
    ]);
    const [showHighRiskModal, setShowHighRiskModal] = useState(false);
    const [highRiskZones, setHighRiskZones] = useState([]);
    const [loadingHighRisk, setLoadingHighRisk] = useState(false);
    const [highRiskError, setHighRiskError] = useState(false);
    const [publicStats, setPublicStats] = useState(null);
    const [publicStatsState, setPublicStatsState] = useState('loading');
    const refreshDebounceRef = useRef(null);

    const fetchHighRiskZones = useCallback(async () => {
        setLoadingHighRisk(true);
        setHighRiskError(false);
        try {
            const response = await highRiskZonesAPI.getAll();
            if (response.data.success) {
                setHighRiskZones(response.data.data);
            } else {
                throw new Error('High-risk-zone response was unsuccessful');
            }
        } catch (e) {
            console.error('Failed to fetch high risk zones:', e);
            setHighRiskError(true);
        } finally {
            setLoadingHighRisk(false);
        }
    }, []);

    const fetchPublicStats = useCallback(async () => {
        setPublicStatsState((current) => current === 'ready' ? current : 'loading');
        try {
            const res = await analyticsAPI.getPublic();
            if (res.data.success) {
                const p = res.data.data || {};
                setPublicStats({
                    verifiedReportsThisMonth: p.verifiedReportsThisMonth ?? p.verifiedThisMonth ?? 0,
                    activeHighRiskZones: p.activeHighRiskZones ?? 0,
                    totalReportsAllTime: p.totalReportsAllTime ?? 0,
                    systemStatus: p.systemStatus || 'Operational',
                    period: p.period || null,
                });
                setPublicStatsState('ready');
                return;
            }
            throw new Error('Public analytics response was unsuccessful');
        } catch {
            // Do not substitute /reports/stats here: its reportsLast30Days value
            // is a rolling window and is not equivalent to this calendar-month metric.
            setPublicStats(null);
            setPublicStatsState('error');
        }
    }, []);

    useEffect(() => { fetchPublicStats(); }, [fetchPublicStats]);
    useEffect(() => { if (showHighRiskModal) fetchHighRiskZones(); }, [showHighRiskModal, fetchHighRiskZones]);

    useEffect(() => {
        const debounce = () => {
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
            refreshDebounceRef.current = setTimeout(() => {
                fetchPublicStats();
                if (showHighRiskModal) fetchHighRiskZones();
            }, 400);
        };
        const subs = [
            subscribe('newReport', debounce),
            subscribe('reportVerified', debounce),
            subscribe('reportResolved', debounce),
            subscribe('reportDeleted', debounce),
            subscribe('highRiskZoneCreated', debounce),
            subscribe('highRiskZoneUpdated', debounce),
            subscribe('highRiskZoneDeleted', debounce),
        ];
        return () => {
            if (refreshDebounceRef.current) { clearTimeout(refreshDebounceRef.current); refreshDebounceRef.current = null; }
            subs.forEach(u => u());
        };
    }, [subscribe, fetchPublicStats, fetchHighRiskZones, showHighRiskModal]);

    useEffect(() => {
        reportsAPI.getMunicipalities()
            .then(r => { if (r.data.success && r.data.data.length > 0) setMunicipalities(r.data.data); })
            .catch(() => {});
    }, []);

    const barangayCount = (name) => name === 'Cajidiocan' ? 14 : name === 'Magdiwang' ? 9 : 12;
    const totalBarangayCount = municipalities.reduce(
        (total, municipality) => total + (municipality.barangays?.length || barangayCount(municipality.name)),
        0
    );

    const verifiedPeriodLabel = getVerifiedPeriodLabel(publicStats?.period);

    const logoConfig = {
        Cajidiocan: { src: '/icons/Cajidiocan.logo.png', scale: 'scale-150' },
        Magdiwang: { src: '/icons/Magdiwang.logo.png', scale: 'scale-150' },
        'San Fernando': { src: '/icons/Sanfernando.logo.png', scale: 'scale-75' },
    };

    const severityBadge = (s) => ({
        critical: 'bg-red-50 text-red-600 border-red-200',
        high: 'bg-orange-50 text-orange-600 border-orange-200',
        medium: 'bg-amber-50 text-amber-700 border-amber-200',
        low: 'bg-blue-50 text-blue-600 border-blue-200',
    }[s] || 'bg-gray-50 text-gray-600 border-gray-200');

    const steps = [
        { n: '01', Icon: HiOutlineDocumentText, title: 'Reporter submits', desc: 'Verified residents file an incident — location, category, severity, and photos.' },
        { n: '02', Icon: HiOutlineClipboardCheck, title: 'Admin verifies', desc: 'Municipal administrators review and publish the report to active responders.' },
        { n: '03', Icon: HiOutlineShieldCheck, title: 'Responders act', desc: 'BFP, PNP, MDRRMO, and SDH receive instant alerts and navigate to the scene.' },
    ];

    const features = [
        { Icon: HiOutlineMap, title: 'Live map', desc: 'Real-time incident map with satellite and street views across all municipalities.' },
        { Icon: HiOutlineShieldCheck, title: 'Verified reports', desc: 'Every report is reviewed by local authorities before going live to responders.' },
        { Icon: HiOutlineBell, title: 'Instant alerts', desc: 'Push notifications the moment a report is verified, assigned, or resolved.' },
        { Icon: HiOutlineChartBar, title: 'Analytics', desc: 'Response time trends, heatmaps, and monthly summaries per municipality.' },
    ];

    const destPath = user?.role === 'reporter' ? '/my-reports' : '/dashboard';

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">

            {/* ── Navbar ── */}
            <header className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100/80">
                <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[60px] flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2.5 group">
                        <img src="/icons/Alert.png" alt="Sibuyan Alert" className="w-7 h-7 object-contain" />
                        <span className="font-bold text-[15px] text-gray-900 tracking-tight">Sibuyan Alert</span>
                    </Link>
                    <nav className="flex items-center gap-1">
                        {isAuthenticated ? (
                            <Link
                                to={destPath}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                {user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}
                                <HiOutlineArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className="px-3.5 py-2 text-sm text-gray-500 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50">
                                    Sign in
                                </Link>
                                <Link to="/register" className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors ml-1">
                                    Get started
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="overflow-hidden border-b border-gray-100 pt-[60px]">
                <div className="grid lg:min-h-[660px] lg:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)] xl:min-h-[700px]">
                    <div className="flex w-full max-w-[640px] flex-col justify-center px-5 py-14 sm:px-8 sm:py-16 lg:ml-auto lg:px-8 lg:py-16 lg:pr-14 xl:pr-20">
                        <div className={`mb-8 inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 ${publicStatsState === 'error' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200/80 bg-emerald-50'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${publicStatsState === 'error' ? 'bg-amber-500' : publicStatsState === 'loading' ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                            <span className={`text-xs font-medium ${publicStatsState === 'error' ? 'text-amber-800' : 'text-emerald-700'}`}>
                                {publicStatsState === 'loading'
                                    ? 'Checking live system data'
                                    : publicStatsState === 'error'
                                        ? 'Live data temporarily unavailable'
                                        : 'Live across Sibuyan Island'}
                            </span>
                        </div>

                        <h1 className="mb-6 text-4xl font-extrabold leading-[1.06] tracking-tight text-gray-900 xs:text-[2.6rem] sm:text-5xl lg:text-[3.25rem]">
                            Accident reports,<br />
                            <span className="text-emerald-700">verified &amp; mapped</span><br />
                            in real time.
                        </h1>

                        <p className="mb-10 max-w-[480px] text-[1.05rem] leading-relaxed text-gray-500">
                            A community reporting system that connects Sibuyan residents, municipal administrators, and emergency responders in one operational view.
                        </p>

                        <div className="mb-8 flex flex-col gap-3 xs:flex-row xs:flex-wrap">
                            <Link
                                to="/dashboard?view=map"
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                            >
                                <HiOutlineMap className="h-4 w-4" />
                                View live map
                            </Link>
                            {!isAuthenticated && (
                                <Link
                                    to="/register"
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                                >
                                    Become a reporter
                                    <HiOutlineArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            )}
                        </div>

                        <figure className="relative -mx-5 mb-8 h-60 overflow-hidden sm:-mx-8 sm:h-80 lg:hidden">
                            <img
                                src="/images/sibuyan-hero.jpg"
                                alt="Mountain ridges of Mount Guiting-Guiting overlooking Sibuyan Island"
                                className="absolute inset-0 h-full w-full object-cover object-[60%_55%]"
                                {...{ fetchpriority: 'high' }}
                                decoding="async"
                            />
                            <figcaption className="absolute inset-x-0 bottom-0 bg-gray-950/75 px-5 py-3 text-xs font-medium text-white sm:px-8">
                                Mt. Guiting-Guiting · Sibuyan Island, Romblon
                            </figcaption>
                        </figure>

                        <div className="mb-12 flex flex-wrap items-center gap-x-4 gap-y-1.5 lg:mb-10">
                            <span className="text-xs text-gray-400">Coordinated with</span>
                            {['BFP', 'PNP', 'MDRRMO', 'SDH'].map(agency => (
                                <span key={agency} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">{agency}</span>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-7 sm:gap-6">
                            <div>
                                <div className="text-[1.65rem] font-bold leading-tight text-gray-900 tabular-nums">
                                    {publicStatsState === 'loading' ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'}
                                </div>
                                <div className="mt-1 text-xs leading-snug text-gray-400">{verifiedPeriodLabel}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHighRiskModal(true)}
                                className="-m-2 rounded-lg p-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                                aria-haspopup="dialog"
                            >
                                <div className="text-[1.65rem] font-bold leading-tight text-gray-900 tabular-nums">
                                    {publicStatsState === 'loading' ? '…' : publicStats?.activeHighRiskZones ?? '—'}
                                </div>
                                <div className="mt-1 text-xs leading-snug text-gray-400">Active risk zones</div>
                            </button>
                            <div>
                                <div className="text-[1.65rem] font-bold leading-tight text-gray-900 tabular-nums">{municipalities.length}</div>
                                <div className="mt-1 text-xs leading-snug text-gray-400">Municipalities covered</div>
                            </div>
                        </div>
                    </div>

                    <figure className="relative hidden min-h-[660px] overflow-hidden lg:block xl:min-h-[700px]">
                        <img
                            src="/images/sibuyan-hero.jpg"
                            alt="Mountain ridges of Mount Guiting-Guiting overlooking Sibuyan Island"
                            className="absolute inset-0 h-full w-full object-cover object-[60%_55%]"
                            {...{ fetchpriority: 'high' }}
                            decoding="async"
                        />
                        <figcaption className="absolute bottom-5 right-5 rounded-md bg-gray-950/75 px-3 py-2 text-xs font-medium tracking-wide text-white">
                            Mt. Guiting-Guiting · Sibuyan Island, Romblon
                        </figcaption>
                    </figure>
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="py-24 px-5 sm:px-8 bg-[#fafafa] border-y border-gray-100">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-12">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">How it works</p>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                            From incident to response, in three steps.
                        </h2>
                        <p className="text-sm text-gray-400 max-w-md">
                            Anyone in the community can report. Authorities verify. Responders coordinate through the same incident record.
                        </p>
                    </div>

                    <div className="grid overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        {steps.map(({ n, Icon, title, desc }) => (
                            <div key={n} className="p-8 sm:p-10">
                                <span className="text-[11px] font-bold text-gray-300 tracking-widest tabular-nums block mb-6">{n}</span>
                                <Icon className="w-5 h-5 text-blue-600 mb-4" />
                                <h3 className="font-semibold text-gray-900 mb-2 text-[15px]">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="py-24 px-5 sm:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-12">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Features</p>
                        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                            Built for speed and reliability.
                        </h2>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {features.map(({ Icon, title, desc }) => (
                            <div
                                key={title}
                                className="group p-6 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-default"
                            >
                                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
                                    <Icon className="w-4 h-4 text-blue-600" />
                                </div>
                                <h3 className="font-semibold text-gray-900 mb-1.5 text-[15px]">{title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Coverage ── */}
            <section className="py-24 px-5 sm:px-8 bg-gray-950 text-white">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 xl:gap-24 items-start">

                    {/* Left: Municipality list */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Coverage</p>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-white">
                            Active across all of Sibuyan Island.
                        </h2>
                        <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-sm">
                            Coordinating with barangay councils and response agencies for rapid, verified incident management island-wide.
                        </p>
                        {/* Community totals */}
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

                        <div className="space-y-2">
                            {municipalities.map((muni) => {
                                const logo = logoConfig[muni.name];
                                const count = muni.barangays?.length > 0 ? muni.barangays.length : barangayCount(muni.name);
                                return (
                                    <div
                                        key={muni.code}
                                        className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors"
                                    >
                                        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden p-1">
                                            {logo
                                                ? <img src={logo.src} alt={muni.name} className={`w-full h-full object-contain ${logo.scale}`} />
                                                : <span className="text-white font-bold text-sm">{muni.name[0]}</span>
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-[14px] text-white">{muni.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{count} barangays</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <HiOutlineShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                            <span className="text-xs text-emerald-400 font-medium">Covered</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: CTA card */}
                    <div className="lg:sticky lg:top-24">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
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
                                        Go to {user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}
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
                        </div>
                    </div>
                </div>
            </section>

            {/* ── High Risk Zones Modal ── */}
            <Modal isOpen={showHighRiskModal} onClose={() => setShowHighRiskModal(false)} title="Active High Risk Zones" size="lg">
                {loadingHighRisk ? (
                    <div className="flex justify-center items-center py-14">
                        <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                ) : highRiskError ? (
                    <div className="py-14 text-center" role="alert">
                        <HiOutlineShieldCheck className="mx-auto mb-3 h-9 w-9 text-gray-300" />
                        <h3 className="mb-1 text-sm font-semibold text-gray-900">Unable to load risk zones</h3>
                        <p className="mb-4 text-sm text-gray-500">Live risk-zone data is temporarily unavailable.</p>
                        <button
                            type="button"
                            onClick={fetchHighRiskZones}
                            className="min-h-11 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                            Try again
                        </button>
                    </div>
                ) : highRiskZones.length === 0 ? (
                    <div className="text-center py-14">
                        <HiOutlineShieldCheck className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-1 text-sm">No active zones</h3>
                        <p className="text-sm text-gray-400">No high-risk zones are currently reported on Sibuyan Island.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {highRiskZones.map((zone) => (
                            <div key={zone._id} className="py-4 first:pt-0 last:pb-0">
                                <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${severityBadge(zone.severity)}`}>
                                                {zone.severity}
                                            </span>
                                            <span className="text-xs text-gray-400">{zone.municipality}</span>
                                        </div>
                                        <h4 className="font-semibold text-gray-900 text-sm mb-1">{zone.name}</h4>
                                        <p className="text-xs text-gray-500 leading-relaxed mb-2">{zone.description}</p>
                                        <div className="flex gap-4 text-xs text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <HiOutlineLightningBolt className="w-3 h-3" />
                                                {zone.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <HiOutlineLocationMarker className="w-3 h-3" />
                                                {zone.radius}m radius
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="pt-4">
                            <Link
                                to="/dashboard?view=map"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                            >
                                <HiOutlineMap className="w-4 h-4" />
                                View all zones on map
                            </Link>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── Footer ── */}
            <footer className="border-t border-gray-100 pt-8 pb-7 px-5 sm:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5">
                        <div className="flex items-center gap-2">
                            <img src="/icons/Alert.png" alt="Sibuyan Alert" className="w-5 h-5 object-contain" />
                            <span className="text-sm font-semibold text-gray-900">Sibuyan Alert</span>
                        </div>
                        <p className="text-xs text-gray-400">Public incident awareness and response coordination</p>
                    </div>
                    <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <p className="text-xs text-gray-400 text-center sm:text-left">
                            Built for the communities of Sibuyan Island — Cajidiocan, Magdiwang &amp; San Fernando.
                        </p>
                        <p className="text-xs text-gray-400 shrink-0">© 2026 Sibuyan Alert System.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
