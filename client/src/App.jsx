import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Layouts
import AuthLayout from './components/layout/AuthLayout';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Pages (eager load)
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
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
                <Route element={<AuthLayout />}>
                    <Route
                        path="/login"
                        element={isAuthenticated ? <Navigate to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'} /> : <LoginPage />}
                    />
                    <Route
                        path="/register"
                        element={isAuthenticated ? <Navigate to={user?.role === 'reporter' ? '/my-reports' : '/dashboard'} /> : <RegisterPage />}
                    />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                </Route>

                {/* Protected Routes */}
                <Route element={<MainLayout />}>
                    {/* Dashboard - accessible to all authenticated users and guests */}
                    {/* Public map view is available to everyone, analytics restricted in DashboardPage */}
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/accident-history" element={<AccidentHistoryPage />} />

                    {/* Notifications - accessible to all authenticated users */}
                    <Route element={<ProtectedRoute />}>
                        <Route path="/notifications" element={<NotificationsPage />} />
                        <Route path="/profile" element={<ProfileSettingsPage />} />
                    </Route>

                    {/* Reporter Only Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['reporter']} requireVerified />}>
                        <Route path="/report" element={<ReportPage />} />
                    </Route>

                    <Route element={<ProtectedRoute allowedRoles={['reporter']} />}>
                        <Route path="/my-reports" element={<MyReportsPage />} />
                    </Route>

                    {/* Admin & Responder Dashboard Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['municipal_admin', 'responder']} />}>
                        <Route path="/admin" element={<AdminPage />} />
                        <Route path="/admin/reports" element={<AdminReportsPage />} />
                    </Route>

                    {/* Admin Only Management Routes */}
                    <Route element={<ProtectedRoute allowedRoles={['municipal_admin']} />}>
                        <Route path="/admin/users" element={<AdminUsersPage />} />
                        <Route path="/admin/zones" element={<AdminHighRiskZonesPage />} />
                    </Route>
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </Suspense>
    );
}

export default App;
