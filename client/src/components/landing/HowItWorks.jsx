import { HiOutlineClipboardCheck, HiOutlineDocumentText, HiOutlineShieldCheck } from 'react-icons/hi';

const steps = [
    { n: '01', Icon: HiOutlineDocumentText, title: 'Reporter submits', desc: 'Verified residents file an incident with its location, category, severity, and supporting photos.' },
    { n: '02', Icon: HiOutlineClipboardCheck, title: 'Administrator verifies', desc: 'Municipal administrators review the report before it is published to the operational map.' },
    { n: '03', Icon: HiOutlineShieldCheck, title: 'Responders act', desc: 'Eligible municipal response units receive the incident and coordinate field action.' },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-100 bg-gray-50 px-5 py-20 dark:border-white/10 dark:bg-[#101f1c] sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
            <div className="mb-10 sm:mb-12">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">How it works</p>
                <h2 className="mb-2 text-2xl font-black tracking-tight text-gray-950 dark:text-white sm:text-3xl">From report to field response.</h2>
                <p className="max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">One incident record follows the exact review and response workflow without mixing administrator and responder responsibilities.</p>
            </div>

            <div className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#152622] sm:grid-cols-3 sm:divide-x sm:divide-gray-200 sm:dark:divide-white/10">
                {steps.map(({ n, Icon, title, desc }, index) => (
                    <div key={n} className={`p-7 sm:p-8 lg:p-10 ${index > 0 ? 'border-t border-gray-200 dark:border-white/10 sm:border-t-0' : ''}`}>
                        <div className="mb-6 flex items-center justify-between">
                            <span className="text-[11px] font-black tracking-widest text-gray-300 dark:text-gray-600">{n}</span>
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                <Icon className="h-4 w-4" />
                            </span>
                        </div>
                        <h3 className="mb-2 text-[15px] font-bold text-gray-950 dark:text-white">{title}</h3>
                        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{desc}</p>
                    </div>
                ))}
            </div>
        </div>
    </section>
);

export default HowItWorks;
