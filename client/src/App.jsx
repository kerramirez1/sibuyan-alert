import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from './router';
import { useAuth } from './context/AuthContext';

// Layouts
import AuthLayout from './components/layout/AuthLayout';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Pages (eager load)
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RegistrationSubmittedPage from './pages/RegistrationSubmittedPage';
import NotFoundPage from './pages/NotFoundPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Protected Pages (lazy load)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const MyReportsPage = lazy(() => import('./pages/MyReportsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage'));
const AdminHighRiskZonesPage = lazy(() => import('./pages/AdminHighRiskZonesPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const AccidentHistoryPage = lazy(() => import('./pages/AccidentHistoryPage'));

// Loading Component
const PageLoader = () => (
    <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
    </div>
);

function App() {
    const { isAuthenticated, loading, user } = useAuth();

    if (loading) {
        return <PageLoader />;
    }

    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomePage />} />

                {/* Auth Routes */}
                <Route path="/login" element={(
                    <AuthLayout>
                        {isAuthenticated ? <Navigate to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'} /> : <LoginPage />}
                    </AuthLayout>
                )} />
                <Route path="/register" element={(
                    <AuthLayout>
                        {isAuthenticated ? <Navigate to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'} /> : <RegisterPage />}
                    </AuthLayout>
                )} />
                <Route path="/registration-submitted" element={(
                    <AuthLayout>
                        {isAuthenticated ? <RegistrationSubmittedPage /> : <Navigate to="/login" />}
                    </AuthLayout>
                )} />
                <Route path="/forgot-password" element={<AuthLayout><ForgotPasswordPage /></AuthLayout>} />
                <Route path="/reset-password/:token" element={<AuthLayout><ResetPasswordPage /></AuthLayout>} />

                {/* Public map and history routes */}
                <Route path="/dashboard" element={<MainLayout><DashboardPage /></MainLayout>} />
                <Route path="/accident-history" element={<MainLayout><AccidentHistoryPage /></MainLayout>} />

                {/* Authenticated account routes */}
                <Route path="/notifications" element={<MainLayout><ProtectedRoute><NotificationsPage /></ProtectedRoute></MainLayout>} />
                <Route path="/profile" element={<MainLayout><ProtectedRoute><ProfileSettingsPage /></ProtectedRoute></MainLayout>} />

                {/* Reporter routes */}
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
