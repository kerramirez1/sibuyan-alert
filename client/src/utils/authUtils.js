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
 * - responder -> /admin (Responder Dashboard workspace)
 * - reporter -> /reporter (Reporter Dashboard)
 * - ordinary (pending/rejected verification) -> /profile (verification status + resubmit)
 * - other / unauthenticated -> /dashboard
 */
export const getDefaultRoleRoute = (user) => {
    const role = user?.role;
    if (role === 'municipal_admin') return '/admin';
    if (role === 'responder') return '/admin';
    if (role === 'reporter') return '/reporter';
    if (role === 'ordinary') return '/profile';
    return '/dashboard';
};

// Paths every visitor (including guests) may open. Auth pages are included
// so a stale ?redirect=/login can never strand a fresh login.
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/registration-submitted',
    '/dashboard',
    '/accident-history',
];

// Authenticated-only but role-agnostic.
const AUTHENTICATED_PATHS = [
    '/notifications',
    '/profile',
];

/**
 * Single source of truth for which routes a role may land on.
 * Mirrors the App.jsx route table (allowedRoles + requireVerified).
 * Query strings never grant access — only the pathname is evaluated.
 */
export const isRouteAllowedForRole = (user, target) => {
    if (typeof target !== 'string' || !target.startsWith('/')) return false;
    const pathname = target.split(/[?#]/, 1)[0] || '/';

    if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/reset-password/')) {
        return true;
    }
    if (!user?.role) return false;
    if (AUTHENTICATED_PATHS.includes(pathname)) return true;

    const role = user.role;
    if (pathname === '/reporter' || pathname === '/my-reports') {
        return role === 'reporter';
    }
    if (pathname === '/report') {
        // Matches ProtectedRoute requireVerified: unverified reporters are
        // bounced to their dashboard instead of the submit form.
        return role === 'reporter' && Boolean(user.isVerified);
    }
    if (pathname === '/admin' || pathname === '/admin/reports') {
        return role === 'municipal_admin' || role === 'responder';
    }
    if (pathname === '/admin/users' || pathname === '/admin/zones') {
        return role === 'municipal_admin';
    }
    return false;
};

/**
 * Resolves the secure internal post-login destination for a user,
 * honoring deep-link targets when valid and falling back to the canonical role route.
 * A target pointing at a route the role may not open is treated like no
 * target at all, so fresh logins always land on their own dashboard.
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
        if (!isRouteAllowedForRole(user, normalized)) {
            return defaultRoute;
        }
        return normalized;
    } catch {
        return defaultRoute;
    }
};
