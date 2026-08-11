import { Link } from '../../router';
import {
    HiBell,
    HiChartBar,
    HiClock,
    HiExclamation,
    HiMap,
    HiShieldCheck,
} from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import SibuyanIslandMap from './SibuyanIslandMap';

const benefits = [
    {
        Icon: HiShieldCheck,
        title: 'Verified reports',
        description: 'Municipal administrators review reports before public publication.',
    },
    {
        Icon: HiBell,
        title: 'Real-time alerts',
        description: 'Authorized users receive lifecycle and assignment updates as they happen.',
    },
    {
        Icon: HiMap,
        title: 'Municipality coordination',
        description: 'Reports and response activity stay scoped to the responsible municipality.',
    },
    {
        Icon: HiExclamation,
        title: 'High-risk areas',
        description: 'View mapped high-risk areas and monitored hazard zones on the live map.',
    },
    {
        Icon: HiChartBar,
        title: 'Responder dispatch',
        description: 'Eligible incidents move from verification to field response in one record.',
    },
];

const Metric = ({ value, label, sublabel = null }) => (
    <div className="flex min-w-[120px] flex-1 flex-col items-center justify-center px-4 py-3 sm:px-8">
        <p className="text-2xl font-black leading-none tabular-nums text-white sm:text-3xl">{value}</p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-500">{label}</p>
        {sublabel && (
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{sublabel}</p>
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
        <section id="home" className="relative isolate overflow-hidden border-b border-gray-200 bg-gray-50 pt-[60px] dark:border-gray-900 dark:bg-[#0a0f0d]">
            {/* ── Background layer 1: Tactical Grid ── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)]"
            />

            {/* ── Background layer 2: Faint radial emerald atmosphere ── */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(16,185,129,0.05),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(52,211,153,0.03),transparent_70%)]"
            />

            <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 py-7 sm:px-8 sm:py-9 lg:min-h-[calc(100svh-160px)] lg:px-10 lg:py-12 xl:px-14">
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
                                        <HiClock className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                                        <HiExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        Report an Incident
                                    </Link>
                                )
                            )}

                            {/* ── Secondary CTA: View live map ────────────────────────────────── */}
                            <Link
                                to="/dashboard?view=map"
                                className="ui-button inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-700 px-2 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                <HiMap className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                        {/* Tactical Capabilities List */}
                        <ul className="flex flex-col gap-6 px-2 py-4 sm:px-0 lg:mt-2">
                            {benefits.map(({ Icon, title, description }) => (
                                <li key={title} className="flex items-start gap-4">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-300 bg-gray-100 shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
                                        <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">{title}</h2>
                                        <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Telemetry Readout (Full Width Bottom Bar) */}
            <div data-testid="landing-hero-metrics" className="w-full border-t border-gray-300 bg-gray-900 px-4 py-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="mx-auto flex max-w-[1440px] flex-row flex-wrap items-center justify-center divide-x divide-gray-700 sm:px-8 lg:px-10 xl:px-14">
                    <Metric value={isLoading ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'} label="VERIFIED REPORTS" sublabel={verifiedPeriodLabel} />
                    <Metric value={isLoading ? '…' : publicStats?.activeHighRiskZones ?? '—'} label="ACTIVE RISK ZONES" />
                    <Metric value={municipalityCount} label="MUNICIPALITIES COVERED" />
                </div>
            </div>
        </section>
    );
};

export default LandingHero;
