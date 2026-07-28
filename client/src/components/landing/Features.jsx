import { HiOutlineBell, HiOutlineChartBar, HiOutlineMap, HiOutlineShieldCheck } from 'react-icons/hi';

const features = [
    { Icon: HiOutlineMap, title: 'Operational map', desc: 'Verified incidents, active responses, and mapped risk zones across Sibuyan.' },
    { Icon: HiOutlineShieldCheck, title: 'Controlled publication', desc: 'Pending reports remain under administrator review before public visibility.' },
    { Icon: HiOutlineBell, title: 'Lifecycle updates', desc: 'Authorized users receive real-time status, transfer, and response updates.' },
    { Icon: HiOutlineChartBar, title: 'Municipal analytics', desc: 'Operational totals and response trends stay aligned with selected scope and period.' },
];

const Features = () => (
    <section className="bg-white px-5 py-20 dark:bg-gray-950 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="mb-10 flex flex-col justify-between gap-4 sm:mb-12 sm:flex-row sm:items-end">
                <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Operational capabilities</p>
                    <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">Built around real municipal workflows.</h2>
                </div>
                <p className="max-w-md text-sm leading-relaxed text-gray-500 dark:text-gray-400">Focused tools for public awareness, administrative review, and field response—without unnecessary dashboard noise.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {features.map(({ Icon, title, desc }) => (
                    <article key={title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#152622] sm:p-6">
                        <span className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            <Icon className="h-5 w-5" />
                        </span>
                        <h3 className="mb-2 text-[15px] font-bold text-gray-950 dark:text-white">{title}</h3>
                        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{desc}</p>
                    </article>
                ))}
            </div>
        </div>
    </section>
);

export default Features;
