import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineLocationMarker,
    HiOutlineMap,
} from 'react-icons/hi';
import { getMapPerformanceProfile } from '../../utils/mapPerformance';

const Landing3DMapPreview = lazy(() => import('./Landing3DMapPreview'));

const LandingPhonePreview = ({ verifiedCount, activeRiskZones, loading = false }) => {
    const previewContainerRef = useRef(null);
    const [load3DPreview, setLoad3DPreview] = useState(false);
    const performanceProfile = useMemo(() => getMapPerformanceProfile(), []);

    useEffect(() => {
        if (!performanceProfile.loadLanding3DPreview || !previewContainerRef.current) return undefined;

        let idleHandle = null;
        let timeoutHandle = null;
        let cancelled = false;
        const schedulePreview = () => {
            if (typeof window.requestIdleCallback === 'function') {
                idleHandle = window.requestIdleCallback(() => {
                    if (!cancelled) setLoad3DPreview(true);
                }, { timeout: 1500 });
                return;
            }
            timeoutHandle = window.setTimeout(() => {
                if (!cancelled) setLoad3DPreview(true);
            }, 250);
        };

        let observer = null;
        if (typeof IntersectionObserver === 'function') {
            observer = new IntersectionObserver(([entry]) => {
                if (!entry?.isIntersecting) return;
                observer.disconnect();
                schedulePreview();
            }, { rootMargin: '160px' });
            observer.observe(previewContainerRef.current);
        } else {
            schedulePreview();
        }

        return () => {
            cancelled = true;
            observer?.disconnect();
            if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleHandle);
            }
            if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
        };
    }, [performanceProfile.loadLanding3DPreview]);

    return (
    <div
        className="relative mx-auto w-full max-w-[150px] sm:max-w-[220px] lg:max-w-[272px] xl:max-w-[292px]"
        role="img"
        aria-label="Mobile preview of the Sibuyan Alert incident map and report workflow"
        data-testid="landing-phone-preview"
    >
        <div className="absolute -inset-8 -z-10 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" aria-hidden="true" />
        <div className="rounded-[1.75rem] border border-white/40 bg-gray-950 p-1 shadow-[0_28px_70px_-25px_rgba(6,24,17,0.8)] ring-1 ring-black/40 sm:rounded-[2.75rem] sm:p-[7px] dark:border-white/15" aria-hidden="true">
            <div className="relative aspect-[9/18.5] overflow-hidden rounded-[1.5rem] bg-white sm:rounded-[2.35rem] dark:bg-[#101c19]">
                <div className="absolute left-1/2 top-1 z-20 h-3 w-[37%] -translate-x-1/2 rounded-full bg-gray-950 sm:top-2 sm:h-5" />

                <div className="flex h-full flex-col pt-5 sm:pt-8">
                    <div className="flex items-center justify-between border-b border-gray-100 px-2 pb-1.5 sm:px-4 sm:pb-3 dark:border-white/10">
                        <div className="flex items-center gap-1 sm:gap-2">
                            <img src="/icons/Alert.png" alt="" className="h-5 w-5 rounded-md object-contain sm:h-7 sm:w-7 sm:rounded-lg" />
                            <div>
                                <p className="text-[7px] font-bold leading-none text-gray-950 sm:text-[10px] dark:text-white">Sibuyan Alert</p>
                                <p className="mt-0.5 text-[5px] font-semibold uppercase tracking-[0.08em] text-emerald-700 sm:mt-1 sm:text-[7px] sm:tracking-[0.12em] dark:text-emerald-300">Public safety map</p>
                            </div>
                        </div>
                        <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-600 sm:h-7 sm:w-7 dark:bg-white/10 dark:text-gray-300">
                            <HiOutlineBell className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500 ring-1 ring-white dark:ring-[#101c19]" />
                        </span>
                    </div>

                    <div className="px-1.5 pt-1.5 sm:px-3 sm:pt-3">
                        <div className="mb-1 flex items-end justify-between sm:mb-2">
                            <div>
                                <p className="text-[5px] font-semibold uppercase tracking-[0.1em] text-gray-400 sm:text-[8px] sm:tracking-[0.14em]">Live overview</p>
                                <p className="text-[9px] font-bold text-gray-950 sm:mt-0.5 sm:text-sm dark:text-white">Incident map</p>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[5px] font-bold text-emerald-700 sm:px-2 sm:py-1 sm:text-[7px] dark:bg-emerald-500/15 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
                            </span>
                        </div>

                        <div ref={previewContainerRef} className="relative h-20 overflow-hidden rounded-lg bg-[#b8d0bd] shadow-inner min-[430px]:h-24 sm:h-36 sm:rounded-2xl lg:h-48">
                            <img src="/images/sibuyan-hero.jpg" alt="" className="h-full w-full object-cover object-[62%_62%] saturate-[0.8]" />
                            {load3DPreview && (
                                <Suspense fallback={null}>
                                    <Landing3DMapPreview />
                                </Suspense>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/5 via-transparent to-slate-950/40" />
                            <div className="absolute left-[22%] top-[32%] flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-[3px] ring-blue-500/20 sm:h-7 sm:w-7 sm:ring-4">
                                <HiOutlineLocationMarker className="h-3 w-3 sm:h-4 sm:w-4" />
                            </div>
                            <div className="absolute right-[20%] top-[48%] flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-lg ring-[3px] ring-red-500/25 sm:h-8 sm:w-8 sm:ring-4">
                                <span className="text-[7px] font-black sm:text-[10px]">!</span>
                            </div>
                            <div className="absolute bottom-1.5 left-1.5 right-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md bg-white/90 px-1.5 py-1 shadow-lg backdrop-blur-md sm:bottom-3 sm:left-3 sm:right-3 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 dark:bg-[#152622]/90">
                                <span className="flex min-w-0 items-center gap-1 text-[6px] font-bold text-gray-800 sm:gap-1.5 sm:text-[8px] dark:text-gray-100">
                                    <HiOutlineMap className="h-2.5 w-2.5 shrink-0 text-emerald-600 sm:h-3 sm:w-3 dark:text-emerald-300" />
                                    <span className="truncate sm:hidden">Sibuyan</span>
                                    <span className="hidden truncate sm:inline">Sibuyan Island</span>
                                </span>
                                <span className="shrink-0 rounded bg-gray-100/90 px-1 py-0.5 text-[5px] font-bold text-gray-600 sm:bg-transparent sm:p-0 sm:text-[7px] sm:font-semibold sm:text-gray-500 dark:bg-white/10 dark:text-gray-300 sm:dark:bg-transparent sm:dark:text-gray-400">
                                    <span className="sm:hidden">3 LGUs</span>
                                    <span className="hidden sm:inline">3 municipalities</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1 px-1.5 pt-1.5 sm:gap-2 sm:px-3 sm:pt-3">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-1.5 sm:rounded-xl sm:p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[5px] font-semibold uppercase leading-tight tracking-wider text-gray-400 sm:text-[7px]">
                                <span className="sm:hidden">Verified</span>
                                <span className="hidden sm:inline">Verified this month</span>
                            </p>
                            <p className="mt-0.5 text-xs font-black tabular-nums text-gray-950 sm:mt-1 sm:text-lg dark:text-white">{loading ? '…' : verifiedCount ?? '—'}</p>
                        </div>
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-1.5 sm:rounded-xl sm:p-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                            <p className="text-[5px] font-semibold uppercase leading-tight tracking-wider text-gray-400 sm:text-[7px]">
                                <span className="sm:hidden">Risk zones</span>
                                <span className="hidden sm:inline">Active risk zones</span>
                            </p>
                            <p className="mt-0.5 text-xs font-black tabular-nums text-gray-950 sm:mt-1 sm:text-lg dark:text-white">{loading ? '…' : activeRiskZones ?? '—'}</p>
                        </div>
                    </div>

                    <div className="mx-3 mt-2.5 hidden rounded-xl border border-emerald-100 bg-emerald-50/80 p-2.5 sm:block dark:border-emerald-400/15 dark:bg-emerald-500/10">
                        <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                                <HiOutlineCheckCircle className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-[9px] font-bold text-gray-900 dark:text-white">Report verified</p>
                                <p className="mt-0.5 truncate text-[7px] text-gray-500 dark:text-gray-400">Responders in the municipality notified</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto grid grid-cols-3 border-t border-gray-100 px-3 pb-2 pt-1.5 text-center sm:px-5 sm:pb-4 sm:pt-2.5 dark:border-white/10">
                        <span className="text-[5px] font-bold text-emerald-700 sm:text-[7px] dark:text-emerald-300">Map</span>
                        <span className="text-[5px] font-medium text-gray-400 sm:text-[7px]">Reports</span>
                        <span className="text-[5px] font-medium text-gray-400 sm:text-[7px]">Alerts</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    );
};

export default LandingPhonePreview;
