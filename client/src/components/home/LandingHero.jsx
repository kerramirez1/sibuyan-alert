import { Link } from 'react-router-dom';
import {
    HiOutlineArrowRight,
    HiOutlineBell,
    HiOutlineChartBar,
    HiOutlineMap,
    HiOutlineShieldCheck,
} from 'react-icons/hi';
import LandingPhonePreview from './LandingPhonePreview';

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

const LandingHero = ({
    isAuthenticated,
    publicStats,
    publicStatsState,
    verifiedPeriodLabel,
    municipalityCount,
}) => {
    const isLoading = publicStatsState === 'loading';

    return (
        <section id="home" className="relative isolate overflow-hidden border-b border-gray-200 pt-[60px] dark:border-white/10">
            <img
                src="/images/sibuyan-hero.jpg"
                alt="Mountain ridges of Mount Guiting-Guiting overlooking Sibuyan Island"
                className="absolute inset-0 -z-30 h-full w-full object-cover object-[62%_58%]"
                {...{ fetchpriority: 'high' }}
                decoding="async"
            />
            <div className="absolute inset-0 -z-20 bg-[linear-gradient(100deg,rgba(248,250,252,0.97)_0%,rgba(248,250,252,0.88)_40%,rgba(240,253,244,0.70)_100%)] dark:bg-[linear-gradient(105deg,rgba(8,20,17,0.97)_0%,rgba(13,30,25,0.92)_50%,rgba(15,23,42,0.78)_100%)]" />
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_58%_35%,rgba(16,185,129,0.18),transparent_26%)] dark:bg-[radial-gradient(circle_at_58%_35%,rgba(52,211,153,0.10),transparent_28%)]" />

            <div className="mx-auto flex min-h-[calc(100svh-60px)] w-full max-w-[1440px] flex-col px-3 py-4 sm:px-8 sm:py-8 lg:px-10 lg:py-12 xl:px-14">
                <div className="grid flex-1 grid-cols-[minmax(0,1fr)_clamp(108px,32vw,150px)] grid-rows-[auto_auto_auto] items-center gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.48fr)] sm:gap-x-8 sm:gap-y-6 lg:grid-cols-[minmax(0,1.06fr)_minmax(250px,0.72fr)_minmax(260px,0.88fr)] lg:grid-rows-[auto_auto] lg:gap-x-10 xl:gap-x-14">
                    <div data-testid="landing-hero-copy" className="col-start-1 row-start-1 min-w-0 overflow-hidden text-left lg:self-end">
                        <div className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 shadow-sm backdrop-blur-md sm:mb-5 sm:gap-2 sm:px-3 sm:py-1.5 ${publicStatsState === 'error'
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

                        <p className="mb-3 hidden text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800 sm:block dark:text-emerald-300">Island-wide incident coordination</p>
                        <h1 className="text-[2rem] font-black leading-[0.96] tracking-[-0.055em] text-gray-950 min-[430px]:text-4xl sm:text-5xl lg:text-[4.5rem] xl:text-[5.25rem] dark:text-white">
                            Report.
                            <span className="block text-emerald-700 dark:text-emerald-300">Verify.</span>
                            <span className="block">Respond.</span>
                        </h1>
                        <p className="mt-3 max-w-xl text-[10px] font-medium leading-relaxed text-gray-700 min-[430px]:text-xs sm:mt-5 sm:text-base lg:text-lg dark:text-gray-200">
                            One operational platform for Sibuyan residents, municipal administrators, and emergency responders—from the first report to field resolution.
                        </p>
                    </div>

                    <div className="relative z-10 col-start-2 row-start-1 min-w-0 self-center lg:row-span-2">
                        <LandingPhonePreview
                            verifiedCount={publicStats?.verifiedReportsThisMonth}
                            activeRiskZones={publicStats?.activeHighRiskZones}
                            loading={isLoading}
                        />
                    </div>

                    <div data-testid="landing-hero-actions" className="col-span-2 row-start-2 flex flex-wrap items-center justify-center gap-2 lg:col-span-1 lg:col-start-1 lg:self-start lg:justify-start sm:gap-3">
                        <Link
                            to="/dashboard?view=map"
                            className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-[0_12px_28px_-14px_rgba(4,120,87,0.8)] transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:px-6 sm:py-3 sm:text-sm"
                        >
                            <HiOutlineMap className="h-4 w-4" /> View live map
                        </Link>
                        {!isAuthenticated && (
                            <Link
                                to="/register"
                                className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-300/80 bg-white/80 px-4 py-2 text-xs font-bold text-gray-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:px-6 sm:py-3 sm:text-sm dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                            >
                                Become a reporter <HiOutlineArrowRight className="h-4 w-4" />
                            </Link>
                        )}
                        <div className="hidden basis-full pt-2 text-center sm:block lg:text-left">
                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Coordinated with BFP · PNP · MDRRMO · SDH</span>
                        </div>
                    </div>

                    <div data-testid="landing-hero-benefits" className="col-span-2 row-start-3 grid grid-cols-2 gap-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 lg:gap-2.5">
                        {benefits.map(({ Icon, title, description }) => (
                            <div key={title} className="flex min-w-0 items-center gap-2 rounded-xl border border-white/60 bg-white/70 p-2 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:items-start sm:gap-3 sm:rounded-2xl sm:p-3.5 dark:border-white/10 dark:bg-[#152622]/80">
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

                <div data-testid="landing-hero-metrics" className="mx-auto mt-3 grid w-full max-w-5xl grid-cols-3 overflow-hidden rounded-xl border border-white/60 bg-white/75 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.75)] backdrop-blur-xl sm:mt-7 sm:rounded-2xl lg:mt-9 dark:border-white/10 dark:bg-[#101f1c]/80">
                    <Metric value={isLoading ? '…' : publicStats?.verifiedReportsThisMonth ?? '—'} label={verifiedPeriodLabel} />
                    <Metric value={isLoading ? '…' : publicStats?.activeHighRiskZones ?? '—'} label="Active risk zones" bordered />
                    <Metric value={municipalityCount} label="Municipalities covered" />
                </div>
                <p className="mt-3 hidden text-center text-[10px] font-semibold text-gray-600/80 sm:block lg:text-right dark:text-gray-300/75">Mount Guiting-Guiting · Sibuyan Island, Romblon</p>
            </div>
        </section>
    );
};

export default LandingHero;
