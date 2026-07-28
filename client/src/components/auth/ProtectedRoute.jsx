import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import { HiOutlineExclamation, HiOutlineClock } from 'react-icons/hi';

const ProtectedRoute = ({ allowedRoles = [], requireVerified = false }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    // Not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check role access
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="min-h-[60vh] flex items-center justify-center p-4"
            >
                <div className="card max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-danger-100 rounded-full flex items-center justify-center">
                        <HiOutlineExclamation className="w-8 h-8 text-danger-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600 mb-4">
                        You don't have permission to access this page.
                    </p>
                    <p className="text-sm text-gray-500">
                        Required role: {allowedRoles.join(' or ')}
                    </p>
                </div>
            </motion.div>
        );
    }

    // Check verification for reporters
    if (requireVerified && user.role === 'reporter' && !user.isVerified) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="min-h-[60vh] flex items-center justify-center p-4"
            >
                <div className="card max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-accent-100 rounded-full flex items-center justify-center">
                        <HiOutlineClock className="w-8 h-8 text-accent-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Verification Required</h2>
                    <p className="text-gray-600 mb-4">
                        Your reporter account is pending verification. You'll be able to submit reports once your municipal administrator approves your account.
                    </p>
                    {user.verificationStatus === 'rejected' && user.verificationFeedback && (
                        <div className="bg-danger-50 border border-danger-200 rounded-xl p-4 text-left mb-4">
                            <p className="text-sm font-medium text-danger-700 mb-1">Feedback:</p>
                            <p className="text-sm text-danger-600">{user.verificationFeedback}</p>
                        </div>
                    )}
                    <div className={`badge ${user.verificationStatus === 'pending' ? 'badge-pending' :
                            user.verificationStatus === 'rejected' ? 'badge-rejected' :
                                'badge-info'
                        }`}>
                        Status: {user.verificationStatus}
                    </div>
                </div>
            </motion.div>
        );
    }

    return <Outlet />;
};

export default ProtectedRoute;
