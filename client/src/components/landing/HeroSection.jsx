import { Link } from '../../router';
import { HiOutlineMap, HiOutlineArrowRight } from 'react-icons/hi';
import { memo } from 'react';

const agencies = ['BFP', 'PNP', 'MDRRMO', 'SDH'];

/*
 * Motion replaced with CSS-only animations:
 *   - Hero image: CSS @keyframes scale-down via animate-hero-scale (defined in index.css)
 *   - Content elements: staggered animate-fade-in (from Tailwind config) with animation-delay
 * This removes ~55 kB (framer-motion) from the eager public bundle.
 */

const HeroSection = memo(function HeroSection({ onStatsState, onStats, municipalities }) {
    const { verifiedReportsThisMonth, activeHighRiskZones, period } = onStats || {};
    const statsState = onStatsState;

    const getVerifiedPeriodLabel = () => {
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

    return (
        <section id="home" className="relative isolate flex min-h-[100svh] overflow-hidden pt-[60px]">
            <img
                src="/images/sibuyan-hero.jpg"
                alt="Mount Guiting-Guiting overlooking Sibuyan Island"
                className="absolute inset-0 -z-20 h-full w-full object-cover object-[58%_55%] hero-scale-in"
                fetchpriority="high"
                decoding="async"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/50 via-white/25 to-white/80 dark:from-gray-950/60 dark:via-gray-950/45 dark:to-gray-950/85" />

            <div className="mx-auto flex w-full max-w-7xl flex-col justify-between px-5 pb-5 pt-14 sm:px-8 sm:pb-7 sm:pt-20 md:pt-24 lg:pt-28">
                <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center pb-10 text-center sm:pb-14">
                    <div
                        className={`mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur-md animate-fade-in ${
                            statsState === 'error'
                                ? 'border-amber-300/70 bg-white/75 dark:border-amber-700/60 dark:bg-gray-900/70'
                                : 'border-emerald-300/70 bg-white/75 dark:border-emerald-700/60 dark:bg-gray-900/70'
                        }`}
                        style={{ animationDuration: '0.4s', animationDelay: '0.2s', animationFillMode: 'both' }}
                    >
                        <span className={statsState === 'error'
                            ? 'h-1.5 w-1.5 rounded-full bg-amber-500'
                            : statsState === 'loading'
                                ? 'h-1.5 w-1.5 rounded-full bg-gray-400'
                                : 'h-1.5 w-1.5 rounded-full bg-emerald-500'} />
                        <span className={statsState === 'error'
                            ? 'text-xs font-semibold text-amber-800 dark:text-amber-300'
                            : 'text-xs font-semibold text-emerald-800 dark:text-emerald-300'}>
                            {statsState === 'loading'
                                ? 'Checking live system data'
                                : statsState === 'error'
                                    ? 'Live data temporarily unavailable'
                                    : 'Live across Sibuyan Island'}
                        </span>
                    </div>

                    <h1
                        className="max-w-4xl text-[2.55rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-gray-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)] xs:text-5xl sm:text-6xl lg:text-7xl dark:text-white dark:drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] animate-fade-in"
                        style={{ animationDuration: '0.6s', animationDelay: '0.1s', animationFillMode: 'both' }}
                    >
                        Accident reports,
                        <span className="mt-1 block text-emerald-800 dark:text-emerald-300">verified &amp; mapped in real time.</span>
                    </h1>

                    <p
                        className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-gray-800 sm:text-lg dark:text-gray-200 animate-fade-in"
                        style={{ animationDuration: '0.6s', animationDelay: '0.2s', animationFillMode: 'both' }}
                    >
                        A community reporting system connecting Sibuyan residents, municipal administrators, and emergency responders in one operational view.
                    </p>

                    <div
                        className="mt-7 flex max-w-full flex-wrap items-center justify-center gap-2 sm:mt-8 sm:gap-3 animate-fade-in"
                        style={{ animationDuration: '0.6s', animationDelay: '0.3s', animationFillMode: 'both' }}
                    >
                        <Link
                            to="/dashboard?view=map"
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:gap-2 sm:rounded-xl sm:px-6 sm:py-3 sm:text-sm"
                        >
                            <HiOutlineMap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            View live map
                        </Link>
                        <Link
                            to="/register"
                            className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-white/80 bg-white/80 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-12 sm:gap-2 sm:rounded-xl sm:px-6 sm:py-3 sm:text-sm dark:border-white/10 dark:bg-gray-900/75 dark:text-gray-100 dark:hover:bg-gray-900"
                        >
                            Become a reporter
                            <HiOutlineArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Link>
                    </div>

                    <div
                        className="mt-7 flex flex-wrap items-center justify-center gap-2 animate-fade-in"
                        style={{ animationDuration: '0.6s', animationDelay: '0.4s', animationFillMode: 'both' }}
                    >
                        <span className="mr-1 text-xs font-medium text-gray-700 dark:text-gray-300">Coordinated with</span>
                        {agencies.map((agency) => (
                            <span key={agency} className="rounded-md border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-bold text-gray-700 backdrop-blur-md dark:border-white/10 dark:bg-gray-900/65 dark:text-gray-200">
                                {agency}
                            </span>
                        ))}
                    </div>
                </div>

                <div
                    className="relative mx-auto grid w-full max-w-4xl grid-cols-3 overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/75 animate-fade-in"
                    style={{ animationDuration: '0.6s', animationDelay: '0.4s', animationFillMode: 'both' }}
                >
                    <div className="px-3 py-4 text-center sm:px-6 sm:py-5">
                        <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">
                            {statsState === 'loading' ? '…' : verifiedReportsThisMonth ?? '—'}
                        </div>
                        <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">
                            {getVerifiedPeriodLabel()}
                        </div>
                    </div>
                    <div className="border-x border-gray-200/80 px-3 py-4 text-center sm:px-6 sm:py-5 dark:border-gray-700">
                        <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">
                            {statsState === 'loading' ? '…' : activeHighRiskZones ?? '—'}
                        </div>
                        <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">Active risk zones</div>
                    </div>
                    <div className="px-3 py-4 text-center sm:px-6 sm:py-5">
                        <div className="text-xl font-bold leading-tight text-gray-950 tabular-nums sm:text-2xl dark:text-white">
                            {municipalities.length}
                        </div>
                        <div className="mt-1 text-[10px] font-medium leading-snug text-gray-600 sm:text-xs dark:text-gray-300">Municipalities covered</div>
                    </div>
                </div>

                <p className="mt-3 text-center text-[10px] font-medium text-gray-700/80 sm:text-right dark:text-gray-300/80">
                    Mount Guiting-Guiting · Sibuyan Island, Romblon
                </p>
            </div>
        </section>
    );
});

export default HeroSection;
