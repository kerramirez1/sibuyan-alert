import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    HiOutlineMap,
    HiOutlineLightningBolt,
    HiOutlineUserGroup,
    HiOutlineShieldCheck,
} from 'react-icons/hi';

const features = [
    {
        icon: HiOutlineMap,
        title: 'Interactive Mapping',
        desc: 'Live tracking of incidents and hazards across all municipalities with 3D visualization.',
        gradient: 'from-blue-500 to-cyan-400',
    },
    {
        icon: HiOutlineLightningBolt,
        title: 'Instant Alerts',
        desc: 'Immediate notifications for verified emergencies and disaster warnings.',
        gradient: 'from-amber-500 to-orange-400',
    },
    {
        icon: HiOutlineUserGroup,
        title: 'Community Driven',
        desc: 'Connecting residents, responders, and LGUs for faster coordination.',
        gradient: 'from-emerald-500 to-green-400',
    },
    {
        icon: HiOutlineShieldCheck,
        title: 'Verified Reports',
        desc: 'Every report is reviewed by local authorities before being broadcast.',
        gradient: 'from-purple-500 to-indigo-400',
    },
];

const FloatingOrb = ({ className, delay = 0 }) => (
    <motion.div
        animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            scale: [1, 1.05, 1],
        }}
        transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay,
        }}
        className={className}
    />
);

const AuthLayout = () => {
    return (
        <div className="min-h-screen flex bg-white font-sans selection:bg-brand-200 selection:text-brand-900">
            {/* Left Side - Branding (Visible on Desktop) */}
            <div className="hidden lg:flex lg:w-[52%] xl:w-1/2 relative overflow-hidden items-center justify-center p-10 xl:p-14">
                {/* Deep gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-brand-900 to-slate-900" />

                {/* Animated mesh gradient overlay */}
                <div className="absolute inset-0 opacity-40">
                    <FloatingOrb
                        className="absolute top-[-15%] left-[-10%] w-[70%] h-[70%] bg-brand-600 rounded-full blur-[100px]"
                        delay={0}
                    />
                    <FloatingOrb
                        className="absolute bottom-[-15%] right-[-10%] w-[65%] h-[65%] bg-emerald-600 rounded-full blur-[100px]"
                        delay={2}
                    />
                    <FloatingOrb
                        className="absolute top-[25%] right-[10%] w-[45%] h-[45%] bg-blue-600 rounded-full blur-[100px]"
                        delay={4}
                    />
                    <FloatingOrb
                        className="absolute bottom-[20%] left-[15%] w-[35%] h-[35%] bg-purple-600 rounded-full blur-[80px]"
                        delay={6}
                    />
                </div>

                {/* Subtle grid pattern overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }}
                />

                {/* Content */}
                <div className="relative z-10 w-full max-w-lg">
                    {/* Logo + Title */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="mb-10"
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 bg-white rounded-2xl p-1.5 overflow-hidden flex items-center justify-center shadow-2xl shadow-black/20 ring-1 ring-white/20">
                                <img
                                    src="/icons/Alert.png"
                                    alt="Sibuyan Alert Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <div className="text-white">
                                <h1 className="font-display font-bold text-3xl leading-none tracking-tight">
                                    Sibuyan <span className="text-emerald-400">Alert</span>
                                </h1>
                                <p className="text-brand-300 text-xs tracking-[0.2em] uppercase mt-1 font-medium">
                                    Accident Alert & Mapping System
                                </p>
                            </div>
                        </div>

                        <h2 className="text-white text-2xl xl:text-3xl font-bold leading-snug mb-3">
                            Real-time accident reporting and emergency coordination for{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                                Sibuyan Island
                            </span>
                            .
                        </h2>
                        <p className="text-brand-300/80 text-sm leading-relaxed">
                            Keeping communities safe through technology-driven incident management.
                        </p>
                    </motion.div>

                    {/* Feature Cards */}
                    <div className="grid grid-cols-2 gap-3">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 + idx * 0.1 }}
                                className="group relative bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-sm border border-white/[0.08] hover:border-white/20 rounded-2xl p-4 transition-all duration-300 cursor-default"
                            >
                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className="w-4.5 h-4.5 text-white" />
                                </div>
                                <h3 className="text-white font-bold text-sm mb-1 group-hover:text-emerald-300 transition-colors">
                                    {feature.title}
                                </h3>
                                <p className="text-brand-300/70 text-xs leading-relaxed line-clamp-2">
                                    {feature.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Trust indicators */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="mt-8 flex items-center gap-4"
                    >
                        <div className="flex -space-x-2">
                            {['C', 'M', 'S'].map((letter, i) => (
                                <div
                                    key={letter}
                                    className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 border-2 border-brand-900 flex items-center justify-center text-[10px] font-bold text-white shadow-lg"
                                    style={{ zIndex: 3 - i }}
                                >
                                    {letter}
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-white/80 text-xs font-semibold">3 Municipalities Connected</p>
                            <p className="text-brand-400/60 text-[10px]">Cajidiocan · Magdiwang · San Fernando</p>
                        </div>
                    </motion.div>
                </div>

                {/* Copyright */}
                <div className="absolute bottom-6 left-0 right-0 text-center text-brand-400/30 text-[10px] font-medium tracking-[0.15em] uppercase">
                    © 2026 Sibuyan Alert System
                </div>
            </div>

            {/* Right Side - Form Container */}
            <div className="w-full lg:w-[48%] xl:w-1/2 min-h-screen flex items-center justify-center p-5 sm:p-8 md:p-12 bg-slate-50">

                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="w-full max-w-[460px]"
                >
                    <Outlet />
                </motion.div>
            </div>
        </div>
    );
};

export default AuthLayout;
