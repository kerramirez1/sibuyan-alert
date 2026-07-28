import { motion } from 'framer-motion';
import { HiOutlineMap, HiOutlineShieldCheck, HiOutlineBell, HiOutlineChartBar } from 'react-icons/hi';

const features = [
    { Icon: HiOutlineMap, title: 'Live map', desc: 'Real-time incident map with satellite and street views across all municipalities.' },
    { Icon: HiOutlineShieldCheck, title: 'Verified reports', desc: 'Every report is reviewed by local authorities before going live to responders.' },
    { Icon: HiOutlineBell, title: 'Instant alerts', desc: 'Push notifications the moment a report is verified, assigned, or resolved.' },
    { Icon: HiOutlineChartBar, title: 'Analytics', desc: 'Response time trends, heatmaps, and monthly summaries per municipality.' },
];

const FeatureCard = ({ Icon, title, desc, index }) => (
    <motion.div
        key={title}
        className="group p-6 rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-default"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        whileHover={{ y: -4 }}
    >
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
            <Icon className="w-4 h-4 text-blue-600" />
        </div>
        <h3 className="font-semibold text-gray-900 mb-1.5 text-[15px]">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
    </motion.div>
);

const Features = () => (
    <section className="py-24 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto">
            <motion.div
                className="mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
            >
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Features</p>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                    Built for speed and reliability.
                </h2>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {features.map((feature, index) => (
                    <FeatureCard key={feature.title} {...feature} index={index} />
                ))}
            </div>
        </div>
    </section>
);

export default Features;