import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
    motion: {
        div: (props) => <div data-testid="motion-div">{props.children}</div>,
    },
    AnimatePresence: ({ children }) => <>{children}</>,
}));

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
});
