import { Link } from '../router';
import { motion } from 'framer-motion';
import { HiOutlineHome, HiOutlineArrowLeft } from 'react-icons/hi';
import ThemeToggle from '../components/ui/ThemeToggle';

const NotFoundPage = () => {
    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            <ThemeToggle className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6" />
            {/* Enhanced Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 -z-20" />
            <div className="absolute top-1/4 left-1/4 w-64 sm:w-[500px] h-64 sm:h-[500px] bg-gradient-to-br from-blue-300/40 to-indigo-300/40 rounded-full blur-3xl animate-pulse -z-10" />
            <div className="absolute bottom-1/4 right-1/4 w-64 sm:w-[500px] h-64 sm:h-[500px] bg-gradient-to-br from-purple-300/40 to-pink-300/40 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 sm:w-96 h-48 sm:h-96 bg-gradient-to-br from-indigo-300/30 to-blue-300/30 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '3s' }} />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, type: "spring" }}
                className="text-center max-w-2xl relative z-10"
            >
                {/* Emoji Icon */}
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className="mb-6"
                >
                    <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/50 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer"></div>
                        <span className="text-6xl sm:text-7xl relative z-10">404</span>
                    </div>
                </motion.div>

                {/* 404 Number */}
                <div className="mb-6 sm:mb-8">
                    <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 150, delay: 0.3 }}
                        className="text-8xl sm:text-[180px] font-display font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent drop-shadow-2xl inline-block leading-none"
                    >
                        404
                    </motion.span>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <h1 className="text-3xl sm:text-5xl font-display font-black text-gray-900 mb-4 sm:mb-5">
                        Oops! Page Not Found
                    </h1>

                    <p className="text-gray-600 text-base sm:text-xl mb-10 sm:mb-12 leading-relaxed px-4 sm:px-0 font-medium">
                        The page you're looking for doesn't exist or has been moved to a different location.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 sm:px-0">
                        <Link
                            to="/"
                            className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 sm:px-10 py-4 sm:py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white text-base sm:text-lg font-black rounded-2xl shadow-2xl hover:shadow-3xl shadow-indigo-500/40 transition-all transform hover:scale-105 active:scale-95 relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            <HiOutlineHome className="w-5 h-5 sm:w-6 sm:h-6 relative z-10" />
                            <span className="relative z-10">Go Home</span>
                        </Link>
                        <button
                            onClick={() => window.history.back()}
                            className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 sm:px-10 py-4 sm:py-5 bg-white border-2 border-gray-300 text-gray-700 text-base sm:text-lg font-black rounded-2xl hover:bg-gray-50 hover:border-gray-400 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
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
                    Lost in the digital wilderness? We'll help you find your way!
                </motion.p>
            </motion.div>
        </div>
    );
};

export default NotFoundPage;
