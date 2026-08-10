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
        Icon: HiOutlineExclamation,
        title: 'High-risk areas',
        description: 'View mapped high-risk areas and monitored hazard zones on the live map.',
    },
    {
        Icon: HiOutlineChartBar,
        title: 'Responder dispatch',
        description: 'Eligible incidents move from verification to field response in one record.',
    },
];

const Metric = ({ value, label, sublabel = null, bordered = false }) => (
    <div className={`min-w-0 px-2 py-2.5 text-center sm:px-5 sm:py-4 ${bordered ? 'border-x border-white/30 dark:border-white/10' : ''}`}>
        <p className="text-base font-black leading-none tabular-nums text-gray-950 sm:text-2xl dark:text-white">{value}</p>
        <p className="mt-1 border-t border-[#e2ede7] pt-1 text-[8px] font-semibold leading-snug text-gray-600 sm:mt-1.5 sm:pt-1.5 sm:text-xs dark:border-white/10 dark:text-gray-300">{label}</p>
        {sublabel && (
            <p className="mt-0.5 text-[8px] font-medium tracking-wide text-gray-400 sm:text-[11px] dark:text-gray-500">{sublabel}</p>
        )}
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

            {/* ── Background layer 1: restrained off-white base with a faint emerald tint ──
                 Light: near-neutral off-white across the hero, settling into a soft emerald
                        tint on the right where the map and feature list sit.
                 Dark:  near-black left, deep green right. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-20"
                style={{
                    background: 'linear-gradient(180deg,#f9fcfa 0%,#f6fbf8 70%,#f3faf6 100%)',
                }}
            />
            {/* Dark mode override via pseudo-class so we can keep the inline style */}
            <style>{`.dark #home { background: linear-gradient(180deg,#0a1812 0%,#0d1f17 60%,#10241a 100%) !important; }`}</style>

            {/* ── Background layer 2: faint radial emerald atmosphere (right side, where map sits) ── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_60%_at_80%_42%,rgba(16,185,129,0.08),transparent_75%)] dark:bg-[radial-gradient(ellipse_50%_60%_at_80%_42%,rgba(52,211,153,0.05),transparent_75%)]"
            />

            {/* ── Background layer 3: subtle dot-grid texture ────────────────── */}
            <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <pattern id="hero-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="1" className="fill-emerald-800/[0.05] dark:fill-emerald-400/[0.04]" />
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
                <div data-testid="landing-hero-layout" className="flex flex-1 flex-wrap items-stretch gap-x-3.5 gap-y-5 sm:gap-x-8 sm:gap-y-6 lg:flex-nowrap lg:items-start lg:gap-x-10 xl:gap-x-14">
                    <div className="contents lg:flex lg:min-w-0 lg:flex-[1.1] lg:flex-col lg:items-start">
                    <div data-testid="landing-hero-copy" className="order-1 flex min-w-0 flex-1 self-stretch flex-col justify-between overflow-visible text-left lg:order-none lg:w-full lg:flex-none">
                        <p data-testid="landing-hero-eyebrow" className="mb-6 whitespace-nowrap text-[clamp(6px,1.9vw,9px)] font-bold uppercase tracking-[0.08em] text-emerald-800 min-[400px]:tracking-[0.12em] sm:mb-7 sm:text-[11px] sm:tracking-[0.2em] lg:mb-2 dark:text-emerald-300">
                            Island-wide incident coordination
                        </p>
                        <h1 className="text-[2rem] font-black leading-[0.96] tracking-[-0.055em] text-gray-950 min-[430px]:text-4xl sm:text-5xl lg:text-[4.5rem] xl:text-[5.25rem] dark:text-white">
                            Report.
                            <span className="block text-emerald-700 dark:text-emerald-300">Verify.</span>
                            <span className="block">Respond.</span>
                        </h1>
                    </div>

                    <p data-testid="landing-hero-description" className="order-3 basis-full text-[11px] font-medium leading-relaxed text-gray-700 min-[430px]:text-xs sm:text-base lg:order-none lg:mt-5 lg:max-w-xl lg:basis-auto lg:text-lg dark:text-gray-200">
                        One operational platform for Sibuyan residents, municipal administrators, and emergency responders—from the first report to field resolution.
                    </p>

                    <div data-testid="landing-hero-actions" className="order-4 flex w-full max-w-[410px] basis-full flex-col sm:w-auto sm:max-w-none lg:order-none lg:mt-8 lg:basis-auto">
                        <div data-testid="landing-hero-primary-actions" className="flex w-full flex-nowrap items-center gap-2 sm:w-auto sm:gap-3">
                            {/* ── Primary CTA: Report an Incident ──────────────────────────────── */}
                            {reportCta.show && (
                                reportCta.disabled ? (
                                    <div
                                        className="group relative inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-red-200 px-2 py-2.5 text-[10px] font-bold text-red-400 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm dark:bg-red-900/30 dark:text-red-500"
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
                                        className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-red-600 px-2 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm"
                                    >
                                        <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        Report an Incident
                                    </Link>
                                )
                            )}

                            {/* ── Secondary CTA: View live map ────────────────────────────────── */}
                            <Link
                                to="/dashboard?view=map"
                                className="ui-button inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-2 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                <HiOutlineMap className="h-4 w-4 shrink-0" aria-hidden="true" />
                                View live map
                            </Link>
                        </div>

                        {/* ── Tertiary: Register prompt (unauthenticated only) ───────────── */}
                        {!isAuthenticated && (
                            <div className="hidden pt-3 text-[11px] font-semibold text-gray-500 sm:block dark:text-gray-400">
                                New to Sibuyan Alert?{' '}
                                <Link
                                        to="/register"
                                        className="font-bold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
                                >
                                    Register as a reporter
                                </Link>
                            </div>
                        )}
                    </div>
                    </div>

                    <div data-testid="landing-hero-map" className="relative z-10 order-2 w-[clamp(130px,36vw,200px)] shrink-0 self-stretch sm:w-[clamp(220px,34vw,360px)] lg:order-none lg:w-auto lg:min-w-0 lg:flex-1 lg:self-start">
                        <SibuyanIslandMap />
                    </div>

                    <div data-testid="landing-hero-benefits" className="order-5 basis-full lg:order-none lg:w-[clamp(300px,26vw,380px)] lg:basis-auto lg:flex-none lg:self-start">
                        {/* Flat editorial feature list: one shared subtle surface, items
                             separated by thin dividers instead of individual cards. */}
                        <ul className="divide-y divide-[#e2ede7] rounded-2xl border border-[#dbeae1] bg-white/75 px-4 py-1 sm:px-5 lg:py-0.5 dark:divide-[#1f372c] dark:border-[#1c3428] dark:bg-[#0f2018]/60">
                            {benefits.map(({ Icon, title, description }) => (
                                <li key={title} className="flex items-start gap-2.5 py-3.5 sm:py-3 lg:py-2.5">
                                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                    <div className="min-w-0">
                                        <h2 className="text-[13px] font-bold leading-snug text-gray-950 sm:text-sm dark:text-white">{title}</h2>
                                        <p className="mt-0.5 text-xs leading-5 text-gray-600 dark:text-gray-300">{description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div data-testid="landing-hero-metrics" className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-3 overflow-hidden rounded-xl border border-[#dbeae1] bg-white sm:mt-7 lg:mt-9 dark:border-[#1c3428] dark:bg-[#112219]">
                    <Metric value={isLoading ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'} label="Verified reports" sublabel={verifiedPeriodLabel} />
                    <Metric value={isLoading ? '…' : publicStats?.activeHighRiskZones ?? '—'} label="Active risk zones" bordered />
                    <Metric value={municipalityCount} label="Municipalities covered" />
                </div>
            </div>
        </section>
    );
};

export default LandingHero;
