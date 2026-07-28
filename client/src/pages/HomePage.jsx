import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../router';
import { HiOutlineArrowRight, HiOutlineLogin } from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { analyticsAPI, reportsAPI } from '../services/api';
import ThemeToggle from '../components/ui/ThemeToggle';
import LandingHero from '../components/home/LandingHero';
import HowItWorks from '../components/landing/HowItWorks';
import Features from '../components/landing/Features';
import Coverage from '../components/landing/Coverage';

const DEFAULT_MUNICIPALITIES = [
    { name: 'Cajidiocan', code: 'CAJ', barangays: [] },
    { name: 'Magdiwang', code: 'MAG', barangays: [] },
    { name: 'San Fernando', code: 'SFN', barangays: [] },
];

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
    const [municipalities, setMunicipalities] = useState(DEFAULT_MUNICIPALITIES);
    const [publicStats, setPublicStats] = useState(null);
    const [publicStatsState, setPublicStatsState] = useState('loading');
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

    return (
        <div className="min-h-screen overflow-x-hidden bg-white font-sans text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
            <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1917]/85">
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
                        <ThemeToggle className="!h-10 !min-h-10 !min-w-10 !border-0 !bg-transparent !px-2" />
                        {isAuthenticated ? (
                            <Link to={destination} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-gray-950 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 sm:px-4 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                                <span className="hidden xs:inline">{user?.role === 'reporter' ? 'My Reports' : 'Dashboard'}</span>
                                <span className="xs:hidden">Open</span>
                                <HiOutlineArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" aria-label="Sign in" className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-white/70 hover:text-gray-950 xs:px-3 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white">
                                    <HiOutlineLogin className="h-4 w-4 xs:hidden" aria-hidden="true" />
                                    <span className="hidden xs:inline">Sign in</span>
                                </Link>
                                <Link to="/register" className="ml-0.5 inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 sm:ml-1 sm:px-4 dark:bg-emerald-700 dark:hover:bg-emerald-600">
                                    <span className="sm:hidden">Join</span>
                                    <span className="hidden sm:inline">Get started</span>
                                </Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main>
                <LandingHero
                    isAuthenticated={isAuthenticated}
                    publicStats={publicStats}
                    publicStatsState={publicStatsState}
                    verifiedPeriodLabel={verifiedPeriodLabel}
                    municipalityCount={municipalities.length}
                />
                <HowItWorks />
                <Features />
                <Coverage municipalities={municipalities} userRole={user?.role} />
            </main>

            <footer className="border-t border-gray-100 bg-white px-5 pb-7 pt-8 dark:border-white/10 dark:bg-gray-950 sm:px-8">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-5 flex flex-col items-center justify-between gap-4 sm:flex-row">
                        <div className="flex items-center gap-2">
                            <img src="/icons/Alert.png" alt="" className="h-6 w-6 object-contain" />
                            <span className="text-sm font-bold text-gray-950 dark:text-white">Sibuyan Alert</span>
                        </div>
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400">Public incident awareness and response coordination</p>
                    </div>
                    <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-100 pt-5 dark:border-white/10 sm:flex-row">
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400 sm:text-left">Built for Cajidiocan, Magdiwang, and San Fernando.</p>
                        <p className="shrink-0 text-xs text-gray-500 dark:text-gray-400">© 2026 Sibuyan Alert System.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
