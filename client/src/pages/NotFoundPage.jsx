import { Link } from '../router';
import { motion } from 'framer-motion';
import { HiOutlineHome, HiOutlineArrowLeft } from 'react-icons/hi';

const NotFoundPage = () => {
    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-slate-100 dark:bg-gray-950">
            {/* Subtle command-navy washes instead of off-palette color blobs */}
            <div className="absolute top-1/4 left-1/4 w-64 sm:w-[500px] h-64 sm:h-[500px] bg-brand-200/40 dark:bg-brand-800/20 rounded-full blur-3xl animate-pulse -z-0" />
            <div className="absolute bottom-1/4 right-1/4 w-64 sm:w-[500px] h-64 sm:h-[500px] bg-brand-100/60 dark:bg-brand-900/20 rounded-full blur-3xl animate-pulse -z-0" style={{ animationDelay: '1.5s' }} />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, type: "spring" }}
                className="text-center max-w-2xl relative z-10"
            >
                {/* Status badge */}
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className="mb-6"
                >
                    <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto bg-brand-800 dark:bg-brand-700 rounded-full flex items-center justify-center shadow-2xs relative overflow-hidden">
                        <span className="text-6xl sm:text-7xl relative z-10 text-white font-display font-black">404</span>
                    </div>
                </motion.div>

                {/* 404 Number */}
                <div className="mb-6 sm:mb-8">
                    <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 150, delay: 0.3 }}
                        className="text-8xl sm:text-[180px] font-display font-black text-brand-800 dark:text-white inline-block leading-none"
                    >
                        404
                    </motion.span>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <h1 className="font-display text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl dark:text-white mb-4 sm:mb-5">
                        Oops! Page Not Found
                    </h1>

                    <p className="text-gray-500 dark:text-gray-400 text-base sm:text-xl mb-10 sm:mb-12 leading-relaxed px-4 sm:px-0 font-medium">
                        The page you&apos;re looking for doesn&apos;t exist or has been moved to a different location.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 sm:px-0">
                        <Link
                            to="/"
                            className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 sm:px-10 py-4 sm:py-5 bg-red-600 hover:bg-red-700 text-white text-base sm:text-lg font-bold rounded-xl shadow-2xs transition-all transform hover:scale-105 active:scale-95 relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                        >
                            <HiOutlineHome className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
                            <span className="relative z-10">Go Home</span>
                        </Link>
                        <button
                            onClick={() => window.history.back()}
                            className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 sm:px-10 py-4 sm:py-5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 text-base sm:text-lg font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 shadow-2xs transition-all transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                        >
                            <HiOutlineArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 group-hover:-translate-x-1 transition-transform" />
                            Go Back
                        </button>
                    </div>
                </motion.div>

                {/* Fun Message */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-10 text-sm text-gray-400 font-medium"
                >
                    Lost in the digital wilderness? We&apos;ll help you find your way!
                </motion.p>
            </motion.div>
        </div>
    );
};

export default NotFoundPage;
