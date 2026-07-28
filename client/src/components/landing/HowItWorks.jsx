import { motion } from 'framer-motion';
import { HiOutlineDocumentText, HiOutlineClipboardCheck, HiOutlineShieldCheck } from 'react-icons/hi';

const steps = [
    { n: '01', Icon: HiOutlineDocumentText, title: 'Reporter submits', desc: 'Verified residents file an incident — location, category, severity, and photos.' },
    { n: '02', Icon: HiOutlineClipboardCheck, title: 'Admin verifies', desc: 'Municipal administrators review and publish the report to active responders.' },
    { n: '03', Icon: HiOutlineShieldCheck, title: 'Responders act', desc: 'BFP, PNP, MDRRMO, and SDH receive instant alerts and navigate to the scene.' },
];

const HowItWorks = () => (
    <section id="how-it-works" className="scroll-mt-16 border-y border-gray-100 bg-gray-50 px-5 py-24 sm:px-8">
        <div className="max-w-6xl mx-auto">
            <motion.div
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
            >
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">How it works</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                    From incident to response, in three steps.
                </h2>
                <p className="text-sm text-gray-400 max-w-md">
                    Anyone in the community can report. Authorities verify. Responders coordinate through the same incident record.
                </p>
            </motion.div>

            <motion.div
                className="grid overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                    visible: { transition: { staggerChildren: 0.1 } },
                    hidden: {}
                }}
            >
                {steps.map(({ n, Icon, title, desc }) => (
                    <motion.div
                        key={n}
                        className="p-8 sm:p-10"
                        variants={{
                            hidden: { opacity: 0, y: 20 },
                            visible: { opacity: 1, y: 0 }
                        }}
                        transition={{ duration: 0.5 }}
                    >
                        <span className="text-[11px] font-bold text-gray-300 tracking-widest tabular-nums block mb-6">{n}</span>
                        <Icon className="w-5 h-5 text-blue-600 mb-4" />
                        <h3 className="font-semibold text-gray-900 mb-2 text-[15px]">{title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    </section>
);

export default HowItWorks;