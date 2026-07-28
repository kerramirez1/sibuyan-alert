import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
    HiOutlineMap,
    HiOutlineShieldCheck,
    HiOutlineBell,
    HiOutlineArrowRight,
    HiOutlineChartBar,
    HiOutlineDocumentText,
    HiOutlineClipboardCheck,
    HiOutlineLogin,
} from 'react-icons/hi';
import { reportsAPI, analyticsAPI } from '../services/api';
import ThemeToggle from '../components/ui/ThemeToggle';

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
    const [publicStats, setPublicStats] = useState(null);
    const [publicStatsState, setPublicStatsState] = useState('loading');
    const refreshDebounceRef = useRef(null);

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
    useEffect(() => {
        const debounce = () => {
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
            refreshDebounceRef.current = setTimeout(() => {
                fetchPublicStats();
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
    }, [subscribe, fetchPublicStats]);

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
        <div className="min-h-screen bg-white text-gray-900 font-sans antialiased dark:bg-gray-950 dark:text-gray-100">

            {/* ── Navbar ── */}
            <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-gray-950/75">
                <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-2 px-3 min-[360px]:px-4 sm:px-8">
                    <Link to="/" className="group flex min-w-0 shrink items-center gap-2 sm:gap-2.5" aria-label="Sibuyan Alert home">
                        <img src="/icons/Alert.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
                        <span className="hidden truncate text-sm font-bold tracking-tight text-gray-900 min-[360px]:inline sm:text-[15px]">
                            Sibuyan <span className="hidden xs:inline">Alert</span>
                        </span>
                    </Link>
                    <nav className="hidden items-center gap-7 lg:flex" aria-label="Landing page">
                        <a href="#home" className="text-sm font-semibold text-emerald-800 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200">Home</a>
                        <Link to="/dashboard?view=map" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Live map</Link>
                        <a href="#how-it-works" className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">How it works</a>
                    </nav>
                    <nav className="flex shrink-0 items-center gap-1" aria-label="Account actions">
                        <ThemeToggle className="!h-10 !min-h-10 !min-w-10 !border-0 !bg-transparent !px-2" />
                        {isAuthenticated ? (
                            <Link
                                to={destPath}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 sm:px-4"
                            >
                                <span className="hidden xs:inline">{user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}</span>
                                <span className="xs:hidden">Open</span>
                                <HiOutlineArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    aria-label="Sign in"
                                    className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 xs:px-3"
                                >
                                    <HiOutlineLogin className="h-4 w-4 xs:hidden" aria-hidden="true" />
                                    <span className="hidden xs:inline">Sign in</span>
                                </Link>
                                <Link
                                    to="/register"
                                    className="ml-0.5 inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 sm:ml-1 sm:px-4"
                                >
                                    <span className="sm:hidden">Join</span>
                                    <span className="hidden sm:inline">Get started</span>
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            {/* Full-bleed Mount Guiting-Guiting hero */}
            <section id="home" className="relative isolate flex min-h-[100svh] overflow-hidden border-b border-gray-100 pt-[60px] dark:border-gray-800">
                <img
                    src="/images/sibuyan-hero.jpg"
                    alt="Mountain ridges of Mount Guiting-Guiting overlooking Sibuyan Island"
                    className="absolute inset-0 -z-20 h-full w-full object-cover object-[58%_55%]"
                    {...{ fetchpriority: 'high' }}
                    decoding="async"
                />
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/50 via-white/25 to-white/80 dark:from-gray-950/60 dark:via-gray-950/45 dark:to-gray-950/85" />

                <div className="mx-auto flex w-full max-w-7xl flex-col justify-between px-5 pb-5 pt-14 sm:px-8 sm:pb-7 sm:pt-20 md:pt-24 lg:pt-28">
                    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center pb-10 text-center sm:pb-14">
                        <div
                            className={publicStatsState === 'error'
                                ? 'mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-white/75 px-3 py-1.5 shadow-sm backdrop-blur-md dark:border-amber-700/60 dark:bg-gray-900/70'
                                : 'mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/70 bg-white/75 px-3 py-1.5 shadow-sm backdrop-blur-md dark:border-emerald-700/60 dark:bg-gray-900/70'}
                        >
                            <span className={publicStatsState === 'error' ? 'h-1.5 w-1.5 rounded-full bg-amber-500' : publicStatsState === 'loading' ? 'h-1.5 w-1.5 rounded-full bg-gray-400' : 'h-1.5 w-1.5 rounded-full bg-emerald-500'} />
                            <span className={publicStatsState === 'error' ? 'text-xs font-semibold text-amber-800 dark:text-amber-300' : 'text-xs font-semibold text-emerald-800 dark:text-emerald-300'}>
                                {publicStatsState === 'loading'
                                    ? 'Checking live system data'
                                    : publicStatsState === 'error'
                                        ? 'Live data temporarily unavailable'
                                        : 'Live across Sibuyan Island'}
                            </span>
                        </div>

                        <h1 className="max-w-4xl text-[2.55rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-gray-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)] xs:text-5xl sm:text-6xl lg:text-7xl dark:text-white dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                            Accident reports,
                            <span className="mt-1 block text-emerald-800 dark:text-emerald-300">verified &amp; mapped in real time.</span>
                        </h1>

                        <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-gray-800 sm:text-lg dark:text-gray-200">
                            A community reporting system connecting Sibuyan residents, municipal administrators, and emergency responders in one operational view.
                        </p>

                        <div className="mt-7 flex max-w-full flex-wrap items-center justify-center gap-2 sm:mt-8 sm:gap-3">
                            <Link
                                to="/dashboard?view=map"
                                className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:gap-2 sm:rounded-xl sm:px-6 sm:py-3 sm:text-sm"
                            >
                                <HiOutlineMap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                View live map
                            </Link>
                            {!isAuthenticated && (
                                <Link
                                    to="/register"
                                    className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-white/80 bg-white/80 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:gap-2 sm:rounded-xl sm:px-6 sm:py-3 sm:text-sm dark:border-white/10 dark:bg-gray-900/75 dark:text-gray-100 dark:hover:bg-gray-900"
                                >
                                    Become a reporter
                                    <HiOutlineArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </Link>
                            )}
                        </div>

                        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
                            <span className="mr-1 text-xs font-medium text-gray-700 dark:text-gray-300">Coordinated with</span>
                            {['BFP', 'PNP', 'MDRRMO', 'SDH'].map(agency => (
                                <span key={agency} className="rounded-md border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-bold text-gray-700 backdrop-blur-md dark:border-white/10 dark:bg-gray-900/65 dark:text-gray-200">{agency}</span>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto grid w-full max-w-4xl grid-cols-3 overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/75">
                        <div className="px-3 py-4 text-center sm:px-6 sm:py-5">
                            <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">
                                {publicStatsState === 'loading' ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'}
                            </div>
                            <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">{verifiedPeriodLabel}</div>
                        </div>
                        <div className="border-x border-gray-200/80 px-3 py-4 text-center sm:px-6 sm:py-5 dark:border-gray-700">
                            <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">
                                {publicStatsState === 'loading' ? '…' : publicStats?.activeHighRiskZones ?? '—'}
                            </div>
                            <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">Active risk zones</div>
                        </div>
                        <div className="px-3 py-4 text-center sm:px-6 sm:py-5">
                            <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">{municipalities.length}</div>
                            <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">Municipalities covered</div>
                        </div>
                    </div>

                    <p className="mt-3 text-center text-[10px] font-medium text-gray-700/80 sm:text-right dark:text-gray-300/80">
                        Mount Guiting-Guiting · Sibuyan Island, Romblon
                    </p>
                </div>
            </section>

            {/* ── How it works ── */}
            <section id="how-it-works" className="scroll-mt-16 border-y border-gray-100 bg-gray-50 px-5 py-24 sm:px-8">
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
