import { Navigate, useLocation } from '../../router';
import { useAuth } from '../../context/AuthContext';
import { getDefaultRoleRoute } from '../../utils/authUtils';

import { PageSkeleton } from '../ui/Skeleton';

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

    // Wrong role: bounce to the canonical role dashboard instead of
    // stranding the user on an Access Denied page.
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return <Navigate to={getDefaultRoleRoute(user)} replace />;
    }

    // Unverified reporters cannot open gated forms; send them where their
    // verification status (and resubmit action) actually lives.
    if (requireVerified && user.role === 'reporter' && !user.isVerified) {
        return <Navigate to="/reporter" replace />;
    }

    return children;
};

export default ProtectedRoute;
