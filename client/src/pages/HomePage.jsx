import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { HiOutlineArrowRight, HiOutlineExclamation, HiOutlineLogin } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { analyticsAPI, reportsAPI } from '../services/api';
import LandingHero from '../components/home/LandingHero';
import HowItWorks from '../components/landing/HowItWorks';
import Coverage from '../components/landing/Coverage';
import LegalDocumentModal from '../components/landing/LegalDocumentModal';

const DEFAULT_MUNICIPALITIES = [
    { name: 'Cajidiocan', code: 'CAJ', barangays: [] },
    { name: 'Magdiwang', code: 'MAG', barangays: [] },
    { name: 'San Fernando', code: 'SFN', barangays: [] },
];

const getVerifiedPeriodLabel = (period) => {
    if (!period?.startAt) return 'This month';
    const startAt = new Date(period.startAt);
    if (Number.isNaN(startAt.getTime())) return 'This month';

    try {
        return new Intl.DateTimeFormat('en-PH', {
            month: 'long',
            year: 'numeric',
            timeZone: period.timezone || 'Asia/Manila',
        }).format(startAt);
    } catch {
        return 'This month';
    }
};

const HomePage = () => {
    const { isAuthenticated, user } = useAuth();
    const { subscribe } = useSocket();
    const [municipalities, setMunicipalities] = useState(DEFAULT_MUNICIPALITIES);
    const [publicStats, setPublicStats] = useState(null);
    const [publicStatsState, setPublicStatsState] = useState('loading');
    const [activeLegalDocument, setActiveLegalDocument] = useState(null);
    const refreshDebounceRef = useRef(null);

    const fetchPublicStats = useCallback(async () => {
        setPublicStatsState((current) => current === 'ready' ? current : 'loading');
        try {
            const response = await analyticsAPI.getPublic();
            if (!response.data.success) throw new Error('Public analytics response was unsuccessful');

            const data = response.data.data || {};
            setPublicStats({
                verifiedReportsThisMonth: data.verifiedReportsThisMonth ?? data.verifiedThisMonth ?? 0,
                activeHighRiskZones: data.activeHighRiskZones ?? 0,
                totalReportsAllTime: data.totalReportsAllTime ?? 0,
                systemStatus: data.systemStatus || 'Operational',
                period: data.period || null,
            });
            setPublicStatsState('ready');
        } catch {
            setPublicStats(null);
            setPublicStatsState('error');
        }
    }, []);

    useEffect(() => {
        fetchPublicStats();
    }, [fetchPublicStats]);

    useEffect(() => {
        const scheduleRefresh = () => {
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
            refreshDebounceRef.current = setTimeout(fetchPublicStats, 400);
        };

        const unsubscribe = [
            'newReport',
            'reportVerified',
            'reportResolved',
            'reportDeleted',
            'highRiskZoneCreated',
            'highRiskZoneUpdated',
            'highRiskZoneDeleted',
        ].map((eventName) => subscribe(eventName, scheduleRefresh));

        return () => {
            if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
            refreshDebounceRef.current = null;
            unsubscribe.forEach((handler) => handler());
        };
    }, [fetchPublicStats, subscribe]);

    useEffect(() => {
        reportsAPI.getMunicipalities()
            .then((response) => {
                if (response.data.success && response.data.data.length > 0) {
                    setMunicipalities(response.data.data);
                }
            })
            .catch(() => {});
    }, []);

    const destination = user?.role === 'reporter' ? '/my-reports' : '/dashboard';
    const verifiedPeriodLabel = getVerifiedPeriodLabel(publicStats?.period);

    // The "Report an Incident" button in the header follows the same
    // discoverability rule as the hero CTA — visible to anyone who
    // could plausibly report (unauthenticated visitors + reporters).
    // Non-reporter authenticated roles go straight to their dashboard.
    const showHeaderReportBtn =
        !isAuthenticated || user?.role === 'reporter';

    return (
        <div className="min-h-screen overflow-x-hidden bg-white font-sans text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
            <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200/80 bg-white/95 dark:border-white/10 dark:bg-[#0d1917]/95">
                <div className="mx-auto flex h-[60px] max-w-[1440px] items-center justify-between gap-2 px-3 min-[360px]:px-4 sm:px-8 lg:px-10 xl:px-14">
                    <Link to="/" className="group flex min-w-0 shrink items-center gap-2.5" aria-label="Sibuyan Alert home">
                        <img src="/icons/Alert.png" alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
                        <span className="hidden truncate text-sm font-black tracking-tight text-gray-950 min-[360px]:inline sm:text-base dark:text-white">
                            Sibuyan <span className="text-emerald-700 dark:text-emerald-300">Alert</span>
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-7 lg:flex" aria-label="Landing page">
                        <a href="#home" className="text-sm font-bold text-emerald-800 transition-colors hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200">Home</a>
                        <Link to="/dashboard?view=map" className="text-sm font-semibold text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Live map</Link>
                        <a href="#how-it-works" className="text-sm font-semibold text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">How it works</a>
                    </nav>

                    <nav className="flex shrink-0 items-center gap-1" aria-label="Account actions">
                        {isAuthenticated ? (
                            <Link
                                to={destination}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-gray-950 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 sm:px-4 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                            >
                                <span className="hidden xs:inline">{user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}</span>
                                <span className="xs:hidden">Open</span>
                                <HiOutlineArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        ) : (
                            <Link
                                to="/login"
                                aria-label="Sign in"
                                className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-white/70 hover:text-gray-950 xs:px-3 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <HiOutlineLogin className="h-4 w-4 xs:hidden" aria-hidden="true" />
                                <span className="hidden xs:inline">Sign in</span>
                            </Link>
                        )}

                        {/* Report an Incident — shown to unauthenticated visitors and
                             reporters (verified or not); hidden for admin/responder roles
                             whose workflow lives entirely in the dashboard. */}
                        {showHeaderReportBtn && (
                            <Link
                                to={isAuthenticated && user?.role === 'reporter' && user?.isVerified
                                    ? '/report'
                                    : '/login'
                                }
                                id="header-report-cta"
                                className="ml-1 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:ml-2 sm:px-4"
                            >
                                <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="hidden sm:inline">Report Incident</span>
                                <span className="sm:hidden">Report</span>
                            </Link>
                        )}
                    </nav>
                </div>
            </header>

            <main>
                <LandingHero
                    publicStats={publicStats}
                    publicStatsState={publicStatsState}
                    verifiedPeriodLabel={verifiedPeriodLabel}
                    municipalityCount={municipalities.length}
                />
                <HowItWorks />
                <Coverage municipalities={municipalities} userRole={user?.role} />
            </main>

            <footer className="border-t border-gray-100 bg-white px-5 pb-8 pt-12 dark:border-white/10 dark:bg-gray-950 sm:px-8">
                <div className="mx-auto max-w-6xl">

                    {/* Brand spans the mobile row; navigation and legal links stay side by side. */}
                    <div
                        data-testid="landing-footer-grid"
                        className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr]"
                    >

                        {/* Col 1 — Brand + mission */}
                        <div className="col-span-2 lg:col-span-1">
                            <div className="mb-4 flex items-center gap-2.5">
                                <img src="/icons/Alert.png" alt="" className="h-7 w-7 shrink-0 rounded-lg object-contain" />
                                <span className="text-base font-black tracking-tight text-gray-950 dark:text-white">
                                    Sibuyan <span className="text-emerald-700 dark:text-emerald-300">Alert</span>
                                </span>
                            </div>
                            <p className="mb-4 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                                Public incident reporting and emergency response coordination across Cajidiocan, Magdiwang, and San Fernando.
                            </p>
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                                Romblon State University — Capstone Project
                            </p>
                        </div>

                        {/* Col 2 — Quick links */}
                        <div className="min-w-0">
                            <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Navigate</p>
                            <nav aria-label="Footer navigation">
                                <ul className="space-y-2.5">
                                    {[
                                        { label: 'Home', href: '#home' },
                                        { label: 'How It Works', href: '#how-it-works' },
                                        { label: 'Live Incident Map', to: '/dashboard?view=map' },
                                        { label: 'Sign In', to: '/login' },
                                        { label: 'Register as Reporter', to: '/register' },
                                    ].map(({ label, href, to }) =>
                                        to ? (
                                            <li key={label}>
                                                <Link
                                                    to={to}
                                                    className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                                                >
                                                    {label}
                                                </Link>
                                            </li>
                                        ) : (
                                            <li key={label}>
                                                <a
                                                    href={href}
                                                    className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                                                >
                                                    {label}
                                                </a>
                                            </li>
                                        )
                                    )}
                                </ul>
                            </nav>
                        </div>

                        {/* Col 3 — Legal + project info */}
                        <div className="min-w-0">
                            <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Legal</p>
                            <ul className="space-y-2.5">
                                {[
                                    { label: 'Privacy Policy', documentType: 'privacy' },
                                    { label: 'Terms of Use', documentType: 'terms' },
                                ].map(({ label, documentType }) => (
                                    <li key={documentType}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveLegalDocument(documentType)}
                                            className="rounded text-left text-sm text-gray-500 transition-colors hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-offset-gray-950"
                                        >
                                            {label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* ── Bottom bar ────────────────────────────────────────── */}
                    <div className="mt-10 border-t border-gray-100 pt-6 dark:border-white/10">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <p className="max-w-lg text-xs leading-relaxed text-gray-400 dark:text-gray-600">
                                <strong className="font-semibold text-gray-500 dark:text-gray-500">Disclaimer:</strong>{' '}
                                Sibuyan Alert supports accident reporting and emergency coordination. For immediate life-threatening emergencies, contact the appropriate official emergency service directly.
                            </p>
                            <p className="shrink-0 text-xs text-gray-400 dark:text-gray-600">© 2026 Sibuyan Alert System</p>
                        </div>
                    </div>

                </div>
            </footer>

            <LegalDocumentModal
                documentType={activeLegalDocument}
                isOpen={Boolean(activeLegalDocument)}
                onClose={() => setActiveLegalDocument(null)}
            />
        </div>
    );
};

export default HomePage;
