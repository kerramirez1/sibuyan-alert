import { Navigate, useLocation } from '../../router';
import { useAuth } from '../../context/AuthContext';
import { HiOutlineExclamation, HiOutlineClock } from 'react-icons/hi';

import { PageSkeleton } from '../ui/Skeleton';

const FadeInSlide = ({ children }) => (
    <div className="animate-fade-in min-h-[60vh] flex items-center justify-center p-4" style={{ animationDuration: '0.35s' }}>
        {children}
    </div>
);

const ProtectedRoute = ({ allowedRoles = [], requireVerified = false, children }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6">
                <PageSkeleton label="Loading secure page..." className="max-w-4xl" />
            </div>
        );
    }

    // Not authenticated
    if (!isAuthenticated) {
        const returnUrl = `${location.pathname}${location.search}${location.hash}`;
        const redirectParam = encodeURIComponent(returnUrl);
        return <Navigate to={`/login?redirect=${redirectParam}`} state={{ from: location }} replace />;
    }

    // Check role access
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return (
            <FadeInSlide>
                <div className="card max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-danger-100 rounded-full flex items-center justify-center">
                        <HiOutlineExclamation className="w-8 h-8 text-danger-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600 mb-4">
                        You don&apos;t have permission to access this page.
                    </p>
                    <p className="text-sm text-gray-500">
                        Required role: {allowedRoles.join(' or ')}
                    </p>
                </div>
            </FadeInSlide>
        );
    }

    // Check verification for reporters
    if (requireVerified && user.role === 'reporter' && !user.isVerified) {
        return (
            <FadeInSlide>
                <div className="card max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-accent-100 rounded-full flex items-center justify-center">
                        <HiOutlineClock className="w-8 h-8 text-accent-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Verification Required</h2>
                    <p className="text-gray-600 mb-4">
                        Your reporter account is pending verification. You&apos;ll be able to submit reports once your municipal administrator approves your account.
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
            </FadeInSlide>
        );
    }

    return children;
};

export default ProtectedRoute;
