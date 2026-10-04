import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

// Mock react-icons
vi.mock('react-icons/hi', () => ({
    HiOutlineExclamation: () => <span data-testid="icon-exclamation" />,
    HiOutlineClock: () => <span data-testid="icon-clock" />,
}));

// Shared mock for useAuth — overridden per test
const mockAuthValue = {
    user: null,
    isAuthenticated: false,
    loading: false,
    revalidateSession: vi.fn(),
};

vi.mock('../context/AuthContext', () => ({
    useAuth: () => mockAuthValue,
}));

// Must import AFTER mocks are declared
import ProtectedRoute from '../components/auth/ProtectedRoute';

// Helper: render ProtectedRoute inside a router with a child route
const renderProtected = (props = {}) => {
    return render(
        <MemoryRouter initialEntries={['/protected']}>
            <Routes>
                <Route path="/protected" element={<ProtectedRoute {...props}><div>Protected Content</div></ProtectedRoute>} />
                <Route path="/login" element={<div>Login Page</div>} />
                <Route path="/reporter" element={<div>Dashboard</div>} />
                <Route path="/profile" element={<div>Profile Page</div>} />
            </Routes>
        </MemoryRouter>
    );
};

describe('ProtectedRoute', () => {
    test('redirects to login when user is not authenticated', () => {
        mockAuthValue.user = null;
        mockAuthValue.isAuthenticated = false;
        mockAuthValue.loading = false;

        renderProtected();

        expect(screen.getByText('Login Page')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test('renders child route when user is authenticated with no role restriction', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: true };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected();

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test('redirects to the role dashboard when user role does not match allowedRoles', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: true };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['municipal_admin'] });

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test('allows access when user role is in allowedRoles', () => {
        mockAuthValue.user = { role: 'municipal_admin' };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['municipal_admin'] });

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test.each(['pending', 'rejected'])('redirects %s reporters to their dashboard when requireVerified is true', (verificationStatus) => {
        mockAuthValue.user = { role: 'reporter', isVerified: false, verificationStatus };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['reporter'], requireVerified: true });

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test.each(['pending', 'rejected'])('allows %s reporters to use their role-only workflow pages', (verificationStatus) => {
        mockAuthValue.user = { role: 'reporter', isVerified: false, verificationStatus };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;
        renderProtected({ allowedRoles: ['reporter'] });
        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test('allows verified reporter when requireVerified is true', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: true, verificationStatus: 'approved' };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['reporter'], requireVerified: true });

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test('shows accessible skeleton when auth is loading', () => {
        mockAuthValue.user = null;
        mockAuthValue.isAuthenticated = false;
        mockAuthValue.loading = true;

        renderProtected();

        expect(screen.getByRole('status', { name: 'Loading secure page...' })).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    describe('offline grace mode', () => {
        const offlineReporter = (overrides = {}) => ({
            id: 'reporter-1',
            role: 'reporter',
            name: 'Juan Dela Cruz',
            reporterVerificationStatus: 'approved',
            offline: true,
            ...overrides,
        });

        const renderOfflineAt = (path, props = {}) => {
            mockAuthValue.user = offlineReporter(props.userOverrides);
            mockAuthValue.isAuthenticated = true;
            mockAuthValue.loading = false;
            return render(
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route path="/report" element={<ProtectedRoute allowedRoles={['reporter']} requireVerified><div>Report Form</div></ProtectedRoute>} />
                        <Route path="/reporter" element={<ProtectedRoute allowedRoles={['reporter']}><div>Reporter Dashboard</div></ProtectedRoute>} />
                        <Route path="/my-reports" element={<ProtectedRoute allowedRoles={['reporter']}><div>My Reports</div></ProtectedRoute>} />
                        <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['municipal_admin', 'responder']}><div>Admin Queue</div></ProtectedRoute>} />
                        <Route path="/login" element={<div>Login Page</div>} />
                    </Routes>
                </MemoryRouter>
            );
        };

        test('allows an offline reporter on /report', () => {
            renderOfflineAt('/report');

            expect(screen.getByText('Report Form')).toBeInTheDocument();
            expect(screen.queryByText('Offline mode')).not.toBeInTheDocument();
        });

        test('allows an offline reporter on /reporter', () => {
            renderOfflineAt('/reporter');

            expect(screen.getByText('Reporter Dashboard')).toBeInTheDocument();
            expect(screen.queryByText('Offline mode')).not.toBeInTheDocument();
        });

        test('blocks an offline reporter from /my-reports with the offline notice', () => {
            renderOfflineAt('/my-reports');

            expect(screen.getByText('Offline mode')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Try reconnecting' })).toBeInTheDocument();
            expect(screen.queryByText('My Reports')).not.toBeInTheDocument();
            expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
        });

        test('never grants admin operational routes in offline mode', () => {
            renderOfflineAt('/admin/reports');

            expect(screen.getByText('Offline mode')).toBeInTheDocument();
            expect(screen.queryByText('Admin Queue')).not.toBeInTheDocument();
            // The role mismatch must not bounce into a live-looking page.
            expect(screen.queryByText('Reporter Dashboard')).not.toBeInTheDocument();
        });

        test('bounces an unverified offline reporter from /report to their dashboard', () => {
            renderOfflineAt('/report', {
                userOverrides: { reporterVerificationStatus: 'pending' },
            });

            expect(screen.getByText('Reporter Dashboard')).toBeInTheDocument();
            expect(screen.queryByText('Report Form')).not.toBeInTheDocument();
        });
    });
});
