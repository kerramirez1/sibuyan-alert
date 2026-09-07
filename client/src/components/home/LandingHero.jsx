import { Link } from '../../router';
import {
    HiClock,
    HiExclamation,
    HiMap,
    HiOutlineLocationMarker,
} from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';
import SibuyanIslandMap from './SibuyanIslandMap';

const benefits = [
    {
        title: 'Verified reports',
        description: 'Municipal administrators review reports before public publication.',
    },
    {
        title: 'Real-time alerts',
        description: 'Authorized users receive lifecycle and assignment updates as they happen.',
    },
    {
        title: 'Municipality coordination',
        description: 'Reports and response activity stay scoped to the responsible municipality.',
    },
    {
        title: 'High-risk areas',
        description: 'View mapped high-risk areas and monitored hazard zones on the live map.',
    },
    {
        title: 'Responder dispatch',
        description: 'Eligible incidents move from verification to field response in one record.',
    },
];

const Metric = ({ value, label, sublabel = null }) => (
    <div className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left sm:px-8 sm:py-2.5">
        <p className="font-display text-xl font-black leading-none tabular-nums text-white sm:text-3xl">{value}</p>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-gray-400 sm:text-[10px]">{label}</p>
        {/* Reserved slot keeps all three columns the same height whether or
            not a sublabel exists, so dividers and baselines stay even. */}
        <p className="mt-0.5 min-h-[11px] truncate text-[8px] font-semibold uppercase tracking-wider text-gray-500 sm:min-h-[13px] sm:text-[9px]">{sublabel || ' '}</p>
    </div>
);

/**
 * Derives the "Report an Incident" CTA configuration from the current auth state.
 */
const useReportCta = () => {
    const { isAuthenticated, user, canSubmitReports } = useAuth();

    if (isAuthenticated && user?.role !== 'reporter') {
        return { show: false, to: null, disabled: false, reason: null };
    }

    if (canSubmitReports()) {
        return { show: true, to: '/report', disabled: false, reason: null };
    }

    if (isAuthenticated && user?.role === 'reporter' && !user?.isVerified) {
        const isPending = user?.verificationStatus === 'pending';
        const reason = isPending
            ? 'Your account is pending administrator approval'
            : 'Your account verification was not approved';
        return { show: true, to: null, disabled: true, reason };
    }

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
        <section id="home" className="relative isolate overflow-hidden border-b border-gray-200/80 bg-slate-100 pt-[58px] dark:border-white/5 dark:bg-gray-950">
            {/* Municipal-grade flat background: no decorative grid or radial
                atmosphere layers — contrast comes from the dark metrics bar and
                hairline dividers below. */}
            <div className="mx-auto flex w-full max-w-[1440px] flex-col px-4 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-6 lg:min-h-[calc(100svh-170px)] lg:px-10 lg:py-10 xl:px-14">
                <div data-testid="landing-hero-layout" className="flex flex-1 flex-wrap items-stretch gap-x-2 gap-y-4 min-[400px]:gap-x-3.5 sm:gap-x-8 sm:gap-y-5 lg:flex-nowrap lg:items-start lg:gap-x-10 xl:gap-x-14">
                    {/* ── Column 1: Copy and Actions ── */}
                    <div className="contents lg:flex lg:min-w-0 lg:flex-[1.1] lg:flex-col lg:items-start">
                        <div data-testid="landing-hero-copy" className="order-1 flex min-w-0 flex-1 self-stretch flex-col justify-between overflow-visible text-left lg:order-none lg:w-full lg:flex-none">
                            <p data-testid="landing-hero-eyebrow" className="mb-1.5 max-w-full whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.06em] text-brand-700 min-[400px]:text-[10px] min-[400px]:tracking-[0.12em] sm:mb-2 sm:text-[11px] sm:tracking-[0.2em] lg:mb-2 dark:text-sky-300">
                                Island-wide incident coordination
                            </p>
                            <p className="mb-4 flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                <HiOutlineLocationMarker className="h-3 w-3 shrink-0 text-brand-600 dark:text-sky-400" aria-hidden="true" />
                                Sibuyan Island · Romblon, Philippines
                            </p>
                            <h1 className="font-display text-[1.65rem] font-black leading-[0.96] tracking-[-0.045em] text-gray-950 min-[400px]:text-[2rem] min-[430px]:text-4xl sm:text-5xl lg:text-[4.25rem] xl:text-[5rem] dark:text-white">
                                Report.
                                <span className="block text-brand-700 dark:text-sky-400">Verify.</span>
                                <span className="block">Respond.</span>
                            </h1>
                        </div>

                        <p data-testid="landing-hero-description" className="order-3 basis-full text-xs font-normal leading-relaxed text-gray-600 min-[430px]:text-sm sm:text-base lg:order-none lg:mt-3 lg:max-w-xl lg:basis-auto dark:text-gray-300">
                            One operational platform for Sibuyan residents, municipal administrators, and emergency responders—from the first report to field resolution.
                        </p>

                        <div data-testid="landing-hero-actions" className="order-4 flex w-full max-w-[410px] basis-full flex-col sm:w-auto sm:max-w-none lg:order-none lg:mt-5 lg:basis-auto">
                            <div data-testid="landing-hero-primary-actions" className="flex w-full flex-nowrap items-center gap-2 sm:w-auto sm:gap-3">
                                {/* Primary CTA: Report an Incident */}
                                {reportCta.show && (
                                    reportCta.disabled ? (
                                        <div
                                            className="group relative inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-gray-200 px-2 py-2.5 text-[10px] font-bold text-gray-400 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm dark:bg-white/10 dark:text-gray-500"
                                            aria-disabled="true"
                                            title={reportCta.reason}
                                        >
                                            <HiClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                            Report an Incident
                                            <span
                                                role="tooltip"
                                                className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-sm bg-gray-900 px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700"
                                            >
                                                {reportCta.reason}
                                            </span>
                                        </div>
                                    ) : (
                                        <Link
                                            to={reportCta.to}
                                            id="hero-report-cta"
                                            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-red-600 px-2 py-2.5 text-[10px] font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm"
                                        >
                                            <HiExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
                                            <span>Report<span className="hidden min-[400px]:inline"> an Incident</span></span>
                                        </Link>
                                    )
                                )}

                                {/* Secondary CTA: View live map */}
                                <Link
                                    to="/dashboard?view=map"
                                    className="ui-button inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-white px-2 py-2.5 text-[10px] font-bold text-gray-800 ring-1 ring-gray-200 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 min-[360px]:gap-2 min-[360px]:px-3 min-[360px]:text-xs sm:min-h-12 sm:min-w-[195px] sm:flex-none sm:px-6 sm:py-3 sm:text-sm dark:bg-white/10 dark:text-white dark:ring-white/20 dark:hover:bg-white/15"
                                >
                                    <HiMap className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span>View<span className="hidden min-[400px]:inline"> live</span> map</span>
                                </Link>
                            </div>

                            {/* Tertiary: Register prompt */}
                            {!isAuthenticated && (
                                <div className="hidden pt-2.5 text-[11px] font-medium text-gray-500 sm:block dark:text-gray-400">
                                    New to Sibuyan Alert?{' '}
                                    <Link
                                        to="/register"
                                        className="font-bold text-brand-700 underline-offset-2 hover:underline dark:text-sky-400"
                                    >
                                        Register as a reporter
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Column 2: Sibuyan Island Map ── */}
                    <div data-testid="landing-hero-map" className="relative z-10 order-2 w-[clamp(130px,36vw,200px)] shrink-0 self-stretch sm:w-[clamp(220px,34vw,360px)] lg:order-none lg:w-auto lg:min-w-0 lg:flex-1 lg:self-start">
                        <SibuyanIslandMap />
                    </div>

                    {/* ── Column 3: Tactical Capabilities List ── */}
                    <div data-testid="landing-hero-benefits" className="order-5 basis-full lg:order-none lg:w-[clamp(290px,25vw,360px)] lg:basis-auto lg:flex-none lg:self-start">
                        <ul className="flex flex-col gap-6 px-0 py-1 sm:px-0 lg:mt-2">
                            {benefits.map(({ title, description }) => (
                                <li key={title} className="flex items-start gap-4">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600 dark:bg-sky-400" aria-hidden="true" />
                                    <div className="min-w-0">
                                        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-950 dark:text-white">{title}</h2>
                                        <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* ── Telemetry Readout: single row on all viewports, dividers carry structure ── */}
            <div data-testid="landing-hero-metrics" className="w-full border-t border-white/10 bg-brand-950 px-3 py-3 dark:border-white/10 dark:bg-brand-950 sm:px-4 sm:py-3.5">
                <div className="mx-auto grid max-w-[1440px] grid-cols-3 divide-x divide-white/10 sm:px-8 lg:px-10 xl:px-14 dark:divide-white/10">
                    <Metric value={isLoading ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'} label="VERIFIED REPORTS" sublabel={verifiedPeriodLabel} />
                    <Metric value={isLoading ? '…' : publicStats?.activeHighRiskZones ?? '—'} label="ACTIVE RISK ZONES" />
                    <Metric value={municipalityCount} label="MUNICIPALITIES COVERED" />
                </div>
            </div>
        </section>
    );
};

export default LandingHero;
