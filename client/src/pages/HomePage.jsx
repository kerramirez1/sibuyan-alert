import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { HiOutlineArrowRight } from 'react-icons/hi';
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
            if (!response?.data?.success) throw new Error('Public analytics response was unsuccessful');

            const data = response?.data?.data ?? {};
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
                const rows = response?.data?.data ?? [];
                if (response?.data?.success && Array.isArray(rows) && rows.length > 0) {
                    setMunicipalities(rows);
                }
            })
            .catch(() => {});
    }, []);

    const destination = user?.role === 'reporter' ? '/my-reports' : '/dashboard';
    const verifiedPeriodLabel = getVerifiedPeriodLabel(publicStats?.period);

    // The "Report an Incident" button in the header follows the same
    // discoverability rule as the hero CTA — visible to anyone who
    // could plausibly report (unauthenticated visitors + reporters).
    const showHeaderReportBtn =
        !isAuthenticated || user?.role === 'reporter';

    return (
        <div className="min-h-screen overflow-x-hidden bg-slate-100 font-sans text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
            {/* ── Compact hairline navbar: solid surface, no blur wash ── */}
            <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white dark:border-white/5 dark:bg-gray-950">
                <div className="mx-auto flex h-[58px] max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-8 lg:px-10 xl:px-14">
                    <Link to="/" className="flex min-w-0 shrink items-center gap-0" aria-label="Sibuyan Alert home">
                        <img src="/icons/Alert.png" alt="" className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" />
                        <span aria-hidden="true" className="-ml-1 truncate whitespace-nowrap font-display text-sm font-bold tracking-tight text-gray-950 sm:text-base dark:text-white">
                            ibuyan <span className="text-red-600 dark:text-red-400">Alert</span>
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-7 lg:flex" aria-label="Landing page">
                        <a href="#home" className="text-xs font-bold uppercase tracking-wider text-brand-700 transition-colors hover:text-brand-600 dark:text-sky-300 dark:hover:text-sky-200">Home</a>
                        <Link to="/dashboard?view=map" className="text-xs font-semibold uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Live map</Link>
                        <a href="#how-it-works" className="text-xs font-semibold uppercase tracking-wider text-gray-600 transition-colors hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">How it works</a>
                    </nav>

                    <nav className="flex shrink-0 items-center gap-1 sm:gap-1.5" aria-label="Account actions">
                        {isAuthenticated ? (
                            <Link
                                to={destination}
                                className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-gray-950 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-gray-800 sm:px-4 dark:bg-brand-700 dark:hover:bg-brand-600"
                            >
                                <span>{user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}</span>
                                <HiOutlineArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        ) : (
                            <Link
                                to="/login"
                                className="inline-flex h-9 items-center whitespace-nowrap rounded-md px-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-100 hover:text-gray-950 sm:px-3 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                Sign in
                            </Link>
                        )}

                        {/* Report an Incident Button */}
                        {showHeaderReportBtn && (
                            <Link
                                to={isAuthenticated && user?.role === 'reporter' && user?.isVerified
                                    ? '/report'
                                    : '/login'
                                }
                                id="header-report-cta"
                                className="inline-flex h-9 items-center whitespace-nowrap rounded-md px-2 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 hover:text-red-700 sm:px-3 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                            >
                                <span>Report<span className="hidden min-[400px]:inline"> incident</span></span>
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

            {/* ── Linear-inspired Clean Footer ── */}
            <footer className="border-t border-gray-200/80 bg-slate-100 px-5 pb-8 pt-10 dark:border-white/10 dark:bg-gray-950 sm:px-8 sm:pt-12">
                <div className="mx-auto max-w-6xl">
                    <div
                        data-testid="landing-footer-grid"
                        className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr]"
                    >
                        {/* Col 1 — Brand + mission */}
                        <div className="col-span-2 lg:col-span-1">
                            <div className="mb-3.5 flex items-center gap-0">
                                <img src="/icons/Alert.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
                                <div className="-ml-1 min-w-0">
                                    <span className="sr-only">Sibuyan Alert</span>
                                    <span aria-hidden="true" className="block font-display text-sm font-bold tracking-tight text-gray-950 sm:text-base dark:text-white">
                                        ibuyan <span className="text-brand-700 dark:text-red-400">Alert</span>
                                    </span>
                                    <span className="block truncate text-[9px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                                        Island Operations
                                    </span>
                                </div>
                            </div>
                            <p className="mb-3.5 max-w-xs text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                                Public incident reporting and emergency response coordination across Cajidiocan, Magdiwang, and San Fernando.
                            </p>
                            <p className="font-mono text-[11px] font-medium text-gray-500">
                                Version: RSU-CAPSTONE-2026
                            </p>
                        </div>

                        {/* Col 2 — Quick links */}
                        <div className="min-w-0">
                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quick Links</p>
                            <nav aria-label="Footer navigation">
                                <ul className="space-y-2">
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
                                                     className="inline-block text-xs text-gray-600 transition-all hover:translate-x-0.5 hover:text-brand-700 dark:text-gray-300 dark:hover:text-sky-300"
                                                >
                                                    {label}
                                                </Link>
                                            </li>
                                        ) : (
                                            <li key={label}>
                                                <a
                                                    href={href}
                                                     className="inline-block text-xs text-gray-600 transition-all hover:translate-x-0.5 hover:text-brand-700 dark:text-gray-300 dark:hover:text-sky-300"
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
                            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Legal Information</p>
                            <ul className="space-y-2">
                                {[
                                    { label: 'Privacy Policy', documentType: 'privacy' },
                                    { label: 'Terms of Use', documentType: 'terms' },
                                ].map(({ label, documentType }) => (
                                    <li key={documentType}>
                                        <button
                                            type="button"
                                            onClick={() => setActiveLegalDocument(documentType)}
                                            className="inline-block rounded text-left text-xs text-gray-600 transition-all hover:translate-x-0.5 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:text-gray-300 dark:hover:text-sky-300 dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-gray-950"
                                        >
                                            {label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* ── Bottom bar ────────────────────────────────────────── */}
                    <div className="mt-8 border-t border-gray-200/80 pt-5 dark:border-white/10">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <p className="max-w-lg text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                                <strong className="font-semibold text-amber-600 dark:text-amber-400">Disclaimer:</strong>{' '}
                                Sibuyan Alert supports accident reporting and emergency coordination. For immediate life-threatening emergencies, contact the appropriate official emergency service directly.
                            </p>
                            <p className="shrink-0 text-[11px] font-medium text-gray-500">© 2026 Sibuyan Alert System</p>
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
