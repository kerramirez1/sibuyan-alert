import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from './router';
import { useAuth } from './context/AuthContext';
import { getDefaultRoleRoute, resolvePostLoginRedirect } from './utils/authUtils';

// Layouts
import AuthLayout from './components/layout/AuthLayout';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Pages (eager load)
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

// Lazy-loaded Public Auth Pages
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
                <Route path="/registration-submitted" element={(
                    <AuthLayout variant="login">
                        {isAuthenticated ? <RegistrationSubmittedPage /> : <Navigate to="/login" />}
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
