import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HiOutlineHome, HiOutlineArrowLeft } from 'react-icons/hi';

const NotFoundPage = () => {
    return (
        <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 overflow-hidden">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 -z-20" />
            <div className="absolute top-1/4 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-blue-200/40 rounded-full blur-3xl animate-pulse -z-10" />
            <div className="absolute bottom-1/4 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-indigo-200/40 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '1.5s' }} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 sm:w-72 h-40 sm:h-72 bg-purple-200/30 rounded-full blur-3xl animate-pulse -z-10" style={{ animationDelay: '3s' }} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center max-w-md relative z-10"
            >
                {/* 404 Number */}
                <div className="mb-6 sm:mb-8">
                    <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 150, delay: 0.1 }}
                        className="text-7xl sm:text-9xl font-display font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent drop-shadow-2xl inline-block"
                    >
                        404
                    </motion.span>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
                        Page Not Found
                    </h1>

                    <p className="text-gray-500 text-sm sm:text-lg mb-8 sm:mb-10 leading-relaxed px-4 sm:px-0">
                        The page you're looking for doesn't exist or has been moved.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
                        <Link
                            to="/"
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm sm:text-base font-bold rounded-xl shadow-xl hover:shadow-2xl shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-95"
                        >
                            <HiOutlineHome className="w-4 h-4 sm:w-5 sm:h-5" />
                            Go Home
                        </Link>
                        <button
                            onClick={() => window.history.back()}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white border-2 border-gray-200 text-gray-700 text-sm sm:text-base font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]"
                        >
                            <HiOutlineArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                            Go Back
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default NotFoundPage;
