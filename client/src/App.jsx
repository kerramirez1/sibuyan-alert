import { Suspense, lazy, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from './router';
import { useAuth } from './context/AuthContext';
import { getDefaultRoleRoute, resolvePostLoginRedirect } from './utils/authUtils';

// Layouts
import AuthLayout from './components/layout/AuthLayout';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Pages (eager load)
import HomePage from './pages/HomePage';

// Lazy-loaded Public Pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const RegistrationSubmittedPage = lazy(() => import('./pages/RegistrationSubmittedPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

// Protected Pages (lazy load)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReporterDashboardPage = lazy(() => import('./pages/ReporterDashboardPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const MyReportsPage = lazy(() => import('./pages/MyReportsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'));
const AdminHighRiskZonesPage = lazy(() => import('./pages/AdminHighRiskZonesPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const AccidentHistoryPage = lazy(() => import('./pages/AccidentHistoryPage'));

import { PageSkeleton } from './components/ui/Skeleton';

// Loading Component
const PageLoader = () => (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-white dark:bg-gray-950">
        <PageSkeleton label="Loading application..." className="max-w-4xl" />
    </div>
);

function App() {
    const { isAuthenticated, loading, user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const bootRedirectDoneRef = useRef(false);

    // Idle-prefetch the most likely next chunks so the 2nd navigation never
    // waits on a dynamic import. Same import() as lazy() — Vite reuses the
    // chunk, no double download. Failures are ignored (route still lazy-loads).
    useEffect(() => {
        if (loading) return;
        const prefetch = () => {
            const tasks = [];
            if (!isAuthenticated) {
                tasks.push(import('./pages/LoginPage'), import('./pages/DashboardPage'));
            } else if (user?.role === 'reporter') {
                tasks.push(
                    import('./pages/ReporterDashboardPage'),
                    import('./pages/MyReportsPage'),
                    import('./pages/DashboardPage'),
                );
            } else if (user?.role === 'municipal_admin' || user?.role === 'responder') {
                tasks.push(
                    import('./pages/AdminPage'),
                    import('./pages/AdminReportsPage'),
                    import('./pages/DashboardPage'),
                );
                if (user?.role === 'municipal_admin') tasks.push(import('./pages/AdminUsersPage'));
            }
            Promise.allSettled(tasks).catch(() => {});
        };
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
            return () => window.cancelIdleCallback?.(id);
        }
        const timer = setTimeout(prefetch, 1500);
        return () => clearTimeout(timer);
    }, [loading, isAuthenticated, user?.role]);

    // Strict per-role landing on fresh app open: an authenticated session
    // restored on a public landing spot (/, /dashboard) goes straight to
    // its own dashboard. Deep links (?report=, ?notification=, ?update=,
    // source=) and every other page are left untouched. /login is handled
    // by the validated authRedirectTarget below.
    useEffect(() => {
        if (loading || bootRedirectDoneRef.current) return;
        bootRedirectDoneRef.current = true;
        if (!isAuthenticated || !user?.role) return;
        if (location.pathname !== '/' && location.pathname !== '/dashboard') return;
        const params = new URLSearchParams(location.search);
        if (params.get('report') || params.get('notification')
            || params.get('update') || params.get('source')) return;
        const home = getDefaultRoleRoute(user);
        if (home !== `${location.pathname}${location.search}`) {
            navigate(home, { replace: true });
        }
    }, [loading, isAuthenticated, user, location.pathname, location.search, navigate]);

    if (loading) {
        return <PageLoader />;
    }

    const redirectQuery = new URLSearchParams(location.search).get('redirect')
        || new URLSearchParams(location.search).get('next');
    const authRedirectTarget = resolvePostLoginRedirect(user, redirectQuery);

    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomePage />} />

                {/* Auth Routes */}
                <Route path="/login" element={(
                    <AuthLayout variant="login">
                        {isAuthenticated ? <Navigate to={authRedirectTarget} /> : <LoginPage />}
                    </AuthLayout>
                )} />
                <Route path="/register" element={(
                    <AuthLayout variant="registration">
                        {isAuthenticated ? <Navigate to={getDefaultRoleRoute(user)} /> : <RegisterPage />}
                    </AuthLayout>
                )} />
                {/* Public so a refresh after register never loops to /login when the session cookie is slow. */}
                <Route path="/registration-submitted" element={(
                    <AuthLayout variant="login">
                        <RegistrationSubmittedPage />
                    </AuthLayout>
                )} />
                <Route path="/forgot-password" element={<AuthLayout variant="login"><ForgotPasswordPage /></AuthLayout>} />
                <Route path="/reset-password/:token" element={<AuthLayout variant="login"><ResetPasswordPage /></AuthLayout>} />

                {/* Public map and history routes */}
                <Route path="/dashboard" element={<MainLayout><DashboardPage /></MainLayout>} />
                <Route path="/accident-history" element={<MainLayout><AccidentHistoryPage /></MainLayout>} />

                {/* Authenticated account routes */}
                <Route path="/notifications" element={<MainLayout><ProtectedRoute><NotificationsPage /></ProtectedRoute></MainLayout>} />
                <Route path="/profile" element={<MainLayout><ProtectedRoute><ProfileSettingsPage /></ProtectedRoute></MainLayout>} />

                {/* Reporter routes */}
                <Route path="/reporter" element={<MainLayout><ProtectedRoute allowedRoles={['reporter']}><ReporterDashboardPage /></ProtectedRoute></MainLayout>} />
                <Route path="/report" element={<MainLayout><ProtectedRoute allowedRoles={['reporter']} requireVerified><ReportPage /></ProtectedRoute></MainLayout>} />
                <Route path="/my-reports" element={<MainLayout><ProtectedRoute allowedRoles={['reporter']}><MyReportsPage /></ProtectedRoute></MainLayout>} />

                {/* Administrator and responder routes */}
                <Route path="/admin" element={<MainLayout><ProtectedRoute allowedRoles={['municipal_admin', 'responder']}><AdminPage /></ProtectedRoute></MainLayout>} />
                <Route path="/admin/reports" element={<MainLayout><ProtectedRoute allowedRoles={['municipal_admin', 'responder']}><AdminReportsPage /></ProtectedRoute></MainLayout>} />
                <Route path="/admin/users" element={<MainLayout><ProtectedRoute allowedRoles={['municipal_admin']}><AdminUsersPage /></ProtectedRoute></MainLayout>} />
                <Route path="/admin/zones" element={<MainLayout><ProtectedRoute allowedRoles={['municipal_admin']}><AdminHighRiskZonesPage /></ProtectedRoute></MainLayout>} />

                {/* 404 */}
                <Route element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
}

export default App;
