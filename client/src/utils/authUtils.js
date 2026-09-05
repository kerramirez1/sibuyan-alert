import { normalizeInternalTarget } from '../router';

const EXTERNAL_OR_AMBIGUOUS_TARGET = /^(?:[a-z][a-z\d+.-]*:|\/\/)|\\/i;

const isAuthExclusionPath = (pathname) => {
    return (
        pathname === '/login' ||
        pathname === '/register' ||
        pathname === '/forgot-password' ||
        pathname === '/registration-submitted' ||
        pathname === '/reset-password' ||
        pathname.startsWith('/reset-password/')
    );
};

/**
 * Returns true if the user has one of the allowed roles.
 */
export const hasRole = (user, roles) => {
    if (!user) return false;
    if (typeof roles === 'string') return user.role === roles;
    if (Array.isArray(roles)) return roles.includes(user.role);
    return false;
};

/**
 * Returns true if the user is an approved, verified reporter.
 */
export const isVerifiedReporter = (user) => {
    return user?.role === 'reporter' && Boolean(user?.isVerified);
};

/**
 * Returns true if the user is authorized to submit new incident reports.
 */
export const canSubmitReports = (user) => {
    if (!user) return false;
    return user.role === 'reporter' && Boolean(user.isVerified);
};

/**
 * Returns the default canonical landing route for a specific user role.
 * - municipal_admin -> /admin (Operations Dashboard)
 * - responder -> /admin/reports?view=dispatch-queue (Responder Dispatch Queue)
 * - reporter -> /reporter (Reporter Dashboard)
 * - ordinary (pending/rejected verification) -> /profile (verification status + resubmit)
 * - other / unauthenticated -> /dashboard
 */
export const getDefaultRoleRoute = (user) => {
    const role = user?.role;
    if (role === 'municipal_admin') return '/admin';
    if (role === 'responder') return '/admin/reports?view=dispatch-queue';
    if (role === 'reporter') return '/reporter';
    if (role === 'ordinary') return '/profile';
    return '/dashboard';
};

/**
 * Resolves the secure internal post-login destination for a user,
 * honoring deep-link targets when valid and falling back to the canonical role route.
 */
export const resolvePostLoginRedirect = (user, requestedTarget) => {
    const defaultRoute = getDefaultRoleRoute(user);
    if (!requestedTarget || typeof requestedTarget !== 'string') {
        return defaultRoute;
    }

    const trimmed = requestedTarget.trim();
    if (!trimmed.startsWith('/') || EXTERNAL_OR_AMBIGUOUS_TARGET.test(trimmed)) {
        return defaultRoute;
    }

    try {
        const normalized = normalizeInternalTarget(trimmed);
        const pathname = normalized.split(/[?#]/, 1)[0] || '/';
        if (isAuthExclusionPath(pathname)) {
            return defaultRoute;
        }
        return normalized;
    } catch {
        return defaultRoute;
    }
};
