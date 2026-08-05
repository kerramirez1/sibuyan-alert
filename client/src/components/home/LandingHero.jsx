import { Link } from '../../router';
import {
    HiOutlineBell,
    HiOutlineChartBar,
    HiOutlineClock,
    HiOutlineExclamation,
    HiOutlineMap,
    HiOutlineShieldCheck,
} from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import SibuyanIslandMap from './SibuyanIslandMap';

const benefits = [
    {
        Icon: HiOutlineShieldCheck,
        title: 'Verified reports',
        description: 'Municipal administrators review reports before public publication.',
    },
    {
        Icon: HiOutlineBell,
        title: 'Real-time alerts',
        description: 'Authorized users receive lifecycle and assignment updates as they happen.',
    },
    {
        Icon: HiOutlineMap,
        title: 'Municipality coordination',
        description: 'Reports and response activity stay scoped to the responsible municipality.',
    },
    {
        Icon: HiOutlineChartBar,
        title: 'Responder dispatch',
        description: 'Eligible incidents move from verification to field response in one record.',
    },
];

const Metric = ({ value, label, bordered = false }) => (
    <div className={`min-w-0 px-2 py-2.5 text-center sm:px-5 sm:py-4 ${bordered ? 'border-x border-white/30 dark:border-white/10' : ''}`}>
        <p className="text-base font-black leading-none tabular-nums text-gray-950 sm:text-2xl dark:text-white">{value}</p>
        <p className="mt-1 text-[8px] font-semibold leading-snug text-gray-600 sm:mt-1.5 sm:text-xs dark:text-gray-300">{label}</p>
    </div>
);

/**
 * Derives the "Report an Incident" CTA configuration from the current auth
 * state so the render tree stays declarative and all role logic lives here.
 *
 * @returns {{ show: boolean, to: string|null, disabled: boolean, reason: string|null }}
 */
const useReportCta = () => {
    const { isAuthenticated, user, canSubmitReports } = useAuth();

    // Non-reporter authenticated roles (admin, responder, system_admin) never
    // submit reports — their workflow entry point is the dashboard.
    if (isAuthenticated && user?.role !== 'reporter') {
        return { show: false, to: null, disabled: false, reason: null };
    }

    // Verified reporter: full direct access.
    if (canSubmitReports()) {
        return { show: true, to: '/report', disabled: false, reason: null };
    }

    // Unverified reporter: show the button in a disabled state so they
    // understand what they are waiting for, without hiding the feature.
    if (isAuthenticated && user?.role === 'reporter' && !user?.isVerified) {
        const isPending = user?.verificationStatus === 'pending';
        const reason = isPending
            ? 'Your account is pending administrator approval'
            : 'Your account verification was not approved';
        return { show: true, to: null, disabled: true, reason };
    }

    // Unauthenticated visitor: show the button — clicking navigates to /login
    // which then enforces all access rules. This is intentional: the landing
    // page communicates the system\'s purpose; the route guard enforces access.
    return { show: true, to: '/login', disabled: false, reason: null };
};

const LandingHero = ({
    publicStats,
    publicStatsState,
    verifiedPeriodLabel,
    municipalityCount,
}) => {
    const { isAuthenticated } = useAuth();
    const reportCta = useReportCta();
    const isLoading = publicStatsState === 'loading';

    return (
        <section id="home" className="relative isolate overflow-hidden border-b border-[#d0e8dc] bg-[#f6fbf8] pt-[60px] dark:border-[#1c3428] dark:bg-[#091711]">

            {/* ── Background layer 1: directional brand gradient ────────────────
                 Light: white-left fading to a faint emerald wash on the right
                 Dark:  near-black left, deep green right where the map sits */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-20"
                style={{
                    background: 'linear-gradient(118deg,#f6fbf8 0%,#edf8f2 42%,#d6f1e5 100%)',
                }}
            />
            {/* Dark mode override via pseudo-class so we can keep the inline style */}
            <style>{`.dark #home { background: linear-gradient(118deg,#091711 0%,#0d1f17 48%,#122a1d 100%) !important; }`}</style>

            {/* ── Background layer 2: radial emerald glow (right side, where map sits) ── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_65%_at_78%_44%,rgba(16,185,129,0.14),transparent_70%)] dark:bg-[radial-gradient(ellipse_55%_65%_at_78%_44%,rgba(52,211,153,0.08),transparent_70%)]"
            />

            {/* ── Background layer 3: subtle dot-grid texture ────────────────── */}
            <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <pattern id="hero-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" className="fill-emerald-800/[0.07] dark:fill-emerald-400/[0.06]" />
                    </pattern>
                    {/* Fade-out mask: dots visible on right, invisible on left */}
                    <linearGradient id="hero-dot-mask" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="white" stopOpacity="0" />
                        <stop offset="40%" stopColor="white" stopOpacity="0" />
                        <stop offset="100%" stopColor="white" stopOpacity="1" />
                    </linearGradient>
                    <mask id="hero-dot-fade">
                        <rect width="100%" height="100%" fill="url(#hero-dot-mask)" />
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="url(#hero-dot-grid)" mask="url(#hero-dot-fade)" />
            </svg>


            <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-7 sm:px-8 sm:py-9 lg:min-h-[calc(100svh-60px)] lg:px-10 lg:py-12 xl:px-14">
                <div className="grid flex-1 grid-cols-[minmax(0,1fr)_clamp(130px,36vw,200px)] grid-rows-[auto_auto_auto] items-center gap-x-3.5 gap-y-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] sm:gap-x-8 sm:gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)_minmax(270px,0.88fr)] lg:grid-rows-[auto_auto] lg:gap-x-10 lg:gap-y-8 xl:gap-x-14">
                    <div data-testid="landing-hero-copy" className="col-start-1 row-start-1 min-w-0 overflow-hidden text-left lg:self-end">
                        <div className={`mb-2.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 shadow-sm sm:mb-4 sm:gap-2 sm:px-3 sm:py-1.5 ${publicStatsState === 'error'
                            ? 'border-amber-300/70 bg-white/75 text-amber-800 dark:border-amber-700/60 dark:bg-gray-900/70 dark:text-amber-300'
                            : 'border-emerald-300/70 bg-white/75 text-emerald-800 dark:border-emerald-700/60 dark:bg-gray-900/70 dark:text-emerald-300'}`}
                        >
                            <span className={`h-1.5 w-1.5 rounded-full ${publicStatsState === 'error' ? 'bg-amber-500' : isLoading ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                            <span className="text-[9px] font-semibold sm:text-xs">
                                {isLoading
                                    ? 'Checking live system data'
                                    : publicStatsState === 'error'
                                        ? 'Live data temporarily unavailable'
                                        : 'Live across Sibuyan Island'}
                            </span>
                        </div>

                        <p className="mb-2 hidden text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800 sm:block dark:text-emerald-300">Island-wide incident coordination</p>
                        <h1 className="text-[2rem] font-black leading-[0.96] tracking-[-0.055em] text-gray-950 min-[430px]:text-4xl sm:text-5xl lg:text-[4.5rem] xl:text-[5.25rem] dark:text-white">
                            Report.
                            <span className="block text-emerald-700 dark:text-emerald-300">Verify.</span>
                            <span className="block">Respond.</span>
                        </h1>
                        <p className="mt-3.5 max-w-xl text-[11px] font-medium leading-relaxed text-gray-700 min-[430px]:text-xs sm:mt-5 sm:text-base lg:text-lg dark:text-gray-200">
                            One operational platform for Sibuyan residents, municipal administrators, and emergency responders—from the first report to field resolution.
                        </p>
                    </div>

                    <div className="relative z-10 col-start-2 row-start-1 min-w-0 self-center lg:row-span-2 lg:self-start lg:pt-10">
                        <SibuyanIslandMap />
                    </div>

                    <div data-testid="landing-hero-actions" className="col-span-2 row-start-2 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start sm:gap-3 lg:col-span-1 lg:col-start-1 lg:self-start">
                        {/* ── Primary CTA: Report an Incident ──────────────────────────────── */}
                        {reportCta.show && (
                            reportCta.disabled ? (
                                <div
                                    className="group relative inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-red-200 px-4 py-2 text-xs font-bold text-red-400 sm:min-h-12 sm:px-6 sm:py-3 sm:text-sm dark:bg-red-900/30 dark:text-red-500"
                                    aria-disabled="true"
                                    title={reportCta.reason}
                                >
                                    <HiOutlineClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Report an Incident
                                    <span
                                        role="tooltip"
                                        className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-700"
                                    >
                                        {reportCta.reason}
                                    </span>
                                </div>
                            ) : (
                                <Link
                                    to={reportCta.to}
                                    id="hero-report-cta"
                                    className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-[0_12px_28px_-14px_rgba(185,28,28,0.75)] transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:min-h-12 sm:px-6 sm:py-3 sm:text-sm"
                                >
                                    <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    Report an Incident
                                </Link>
                            )
                        )}

                        {/* ── Secondary CTA: View live map ────────────────────────────────── */}
                        <Link
                            to="/dashboard?view=map"
                            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#d0e8dc] bg-white px-4 py-2 text-xs font-bold text-gray-900 shadow-sm transition-colors hover:bg-[#eef7f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:px-6 sm:py-3 sm:text-sm dark:border-[#264a38] dark:bg-[#162c21] dark:text-white dark:hover:bg-[#1d3628]"
                        >
                            <HiOutlineMap className="h-4 w-4 shrink-0" aria-hidden="true" />
                            View live map
                        </Link>

                        {/* ── Tertiary: Register prompt (unauthenticated only) ───────────── */}
                        {!isAuthenticated && (
                            <div className="hidden basis-full pt-1 text-center sm:block lg:text-left">
                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                    New to Sibuyan Alert?{' '}
                                    <Link
                                        to="/register"
                                        className="font-bold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                                    >
                                        Register as a reporter
                                    </Link>
                                </span>
                            </div>
                        )}

                        <div className="hidden basis-full pt-2 text-center sm:block lg:text-left">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Coordinated with BFP · PNP · MDRRMO · SDH</span>
                        </div>
                    </div>

                    <div data-testid="landing-hero-benefits" className="col-span-2 row-start-3 grid grid-cols-2 gap-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:gap-2.5 lg:self-start lg:pt-10">
                        {benefits.map(({ Icon, title, description }) => (
                            <div key={title} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#d0e8dc] bg-white p-2 shadow-[0_8px_24px_-16px_rgba(9,23,17,0.4)] sm:items-start sm:gap-3 sm:rounded-2xl sm:p-3.5 dark:border-[#1c3428] dark:bg-[#112219]">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:h-10 sm:w-10 sm:rounded-xl dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/10">
                                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                                </span>
                                <div className="min-w-0">
                                    <h2 className="text-[10px] font-bold leading-tight text-gray-950 sm:text-sm dark:text-white">{title}</h2>
                                    <p className="mt-1 hidden text-xs leading-relaxed text-gray-600 sm:block dark:text-gray-300">{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div data-testid="landing-hero-metrics" className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-3 overflow-hidden rounded-xl border border-[#d0e8dc] bg-white shadow-[0_18px_50px_-30px_rgba(9,23,17,0.5)] sm:mt-7 sm:rounded-2xl lg:mt-9 dark:border-[#1c3428] dark:bg-[#112219]">
                    <Metric value={isLoading ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'} label={verifiedPeriodLabel} />
                    <Metric value={isLoading ? '…' : publicStats?.activeHighRiskZones ?? '—'} label="Active risk zones" bordered />
                    <Metric value={municipalityCount} label="Municipalities covered" />
                </div>
            </div>
        </section>
    );
};

export default LandingHero;
