import { HiOutlineBell, HiOutlineChartBar, HiOutlineMap, HiOutlineShieldCheck } from 'react-icons/hi';

// Each feature is assigned a role context so the panel can immediately see
// which part of the system each capability belongs to.
const FEATURES = [
    {
        id: 'operational-map',
        Icon: HiOutlineMap,
        title: 'Operational incident map',
        desc: 'Verified incidents, active responses, and mapped risk zones across all three Sibuyan municipalities — visible to any visitor without an account.',
        role: 'Public',
        roleColor: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/15',
        accent: 'border-emerald-200 dark:border-emerald-500/20',
        iconBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        // This feature gets the wide card treatment
        wide: true,
    },
    {
        id: 'controlled-publication',
        Icon: HiOutlineShieldCheck,
        title: 'Controlled publication',
        desc: 'Pending reports stay under administrator review. Only verified incidents reach the public map.',
        role: 'Admin',
        roleColor: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-500/15',
        accent: 'border-amber-200 dark:border-amber-500/20',
        iconBg: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        wide: false,
    },
    {
        id: 'lifecycle-updates',
        Icon: HiOutlineBell,
        title: 'Real-time lifecycle updates',
        desc: 'Authorized users receive status, transfer, and response notifications as each incident progresses.',
        role: 'All roles',
        roleColor: 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/15',
        accent: 'border-blue-200 dark:border-blue-500/20',
        iconBg: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
        wide: false,
    },
    {
        id: 'municipal-analytics',
        Icon: HiOutlineChartBar,
        title: 'Municipal analytics',
        desc: 'Operational totals and response trends scoped to the selected municipality and time period.',
        role: 'Admin',
        roleColor: 'text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-500/15',
        accent: 'border-violet-200 dark:border-violet-500/20',
        iconBg: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
        wide: false,
    },
];

const wideFeature = FEATURES.find((f) => f.wide);
const smallFeatures = FEATURES.filter((f) => !f.wide);

const Features = () => (
    <section className="bg-white px-5 py-20 dark:bg-gray-950 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">

            <div className="mb-10 flex flex-col justify-between gap-4 sm:mb-12 sm:flex-row sm:items-end">
                <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                        Operational capabilities
                    </p>
                    <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">
                        Built around real municipal workflows.
                    </h2>
                </div>
                <p className="max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    Focused tools for public awareness, administrative review, and field response — aligned to each role in the system.
                </p>
            </div>

            {/* ── Asymmetric feature grid ───────────────────────────────────────
                 Desktop: wide card (col-span-2) + 3 stacked small cards (col-span-1)
                 Mobile: single column stack */}
            <div className="grid gap-4 lg:grid-cols-3">

                {/* Wide feature card — Operational map */}
                {wideFeature && (
                    <article
                        key={wideFeature.id}
                        className={`flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm lg:col-span-2 lg:row-span-3 lg:p-8 dark:bg-[#111e1b] ${wideFeature.accent}`}
                    >
                        <div>
                            <div className="mb-5 flex items-start justify-between gap-3">
                                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${wideFeature.iconBg}`}>
                                    <wideFeature.Icon className="h-6 w-6" aria-hidden="true" />
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${wideFeature.roleColor}`}>
                                    {wideFeature.role}
                                </span>
                            </div>
                            <h3 className="mb-3 text-xl font-black tracking-tight text-gray-950 dark:text-white">
                                {wideFeature.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                                {wideFeature.desc}
                            </p>
                        </div>

                        {/* Visual accent: map legend preview */}
                        <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                                Map legend
                            </p>
                            <ul className="space-y-2" role="list">
                                {[
                                    { dot: 'bg-amber-500', label: 'Under verification' },
                                    { dot: 'bg-emerald-500', label: 'Verified — visible to public' },
                                    { dot: 'bg-blue-500',   label: 'Responding' },
                                    { dot: 'bg-red-400',    label: 'High-risk zone boundary' },
                                ].map(({ dot, label }) => (
                                    <li key={label} className="flex items-center gap-2.5">
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </article>
                )}

                {/* Three smaller feature cards */}
                {smallFeatures.map((feature) => (
                    <article
                        key={feature.id}
                        className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-[#111e1b] sm:p-6 ${feature.accent}`}
                    >
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${feature.iconBg}`}>
                                <feature.Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${feature.roleColor}`}>
                                {feature.role}
                            </span>
                        </div>
                        <h3 className="mb-2 text-[15px] font-bold text-gray-950 dark:text-white">
                            {feature.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                            {feature.desc}
                        </p>
                    </article>
                ))}

            </div>
        </div>
    </section>
);

export default Features;
