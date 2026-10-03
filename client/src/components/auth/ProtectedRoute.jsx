import { useState } from 'react';
import { Navigate, useLocation } from '../../router';
import { useAuth } from '../../context/AuthContext';
import { getDefaultRoleRoute } from '../../utils/authUtils';

import { PageSkeleton } from '../ui/Skeleton';

// Reporter-safe while the session cannot be revalidated: the report form
// (which queues to the device when offline) and the reporter's own
// dashboard. Every other protected route renders the offline notice instead
// of failing on fetches it can never complete.
const OFFLINE_SAFE_PREFIXES = ['/report', '/reporter'];

const isOfflineSafePath = (pathname) => OFFLINE_SAFE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
);

/**
 * What an offline-grace user sees on a protected route that needs a live
 * session. States plainly what still works, and offers a manual re-check
 * for the moment the signal returns before the 'online' event fires.
 */
const OfflineModeNotice = () => {
    const { user, revalidateSession } = useAuth();
    const [checking, setChecking] = useState(false);

    const handleRetry = async () => {
        if (checking) return;
        setChecking(true);
        try {
            await revalidateSession();
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Offline mode
                </p>
                <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                    {user?.name ? `You're offline, ${user.name}` : "You're offline"}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    Your session couldn&apos;t be verified right now, so only filing
                    reports and your dashboard are available. Everything else unlocks
                    when you&apos;re back online — reports saved on this device send
                    automatically.
                </p>
                <button
                    type="button"
                    onClick={handleRetry}
                    disabled={checking}
                    className="btn-outline mt-5 min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {checking ? 'Checking connection…' : 'Try reconnecting'}
                </button>
            </div>
        </div>
    );
};

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

    // Offline grace mode: the session cookie could not be revalidated because
    // the device is offline. Only the reporter-safe routes stay usable; every
    // other protected route explains the limitation. Admin and responder
    // operational routes are never granted in this mode.
    if (user?.offline === true && !isOfflineSafePath(location.pathname)) {
        return <OfflineModeNotice />;
    }

    // Wrong role: bounce to the canonical role dashboard instead of
    // stranding the user on an Access Denied page.
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return <Navigate to={getDefaultRoleRoute(user)} replace />;
    }

    // Unverified reporters cannot open gated forms; send them where their
    // verification status (and resubmit action) actually lives. Offline-mode
    // reporters carry reporterVerificationStatus on the snapshot instead of
    // the live isVerified flag.
    const isVerified = user?.offline === true
        ? user?.reporterVerificationStatus === 'approved'
        : user?.isVerified;
    if (requireVerified && user.role === 'reporter' && !isVerified) {
        return <Navigate to="/reporter" replace />;
    }

    return children;
};

export default ProtectedRoute;
