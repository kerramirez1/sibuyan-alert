import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
                <Route element={<ProtectedRoute {...props} />}>
                    <Route path="/protected" element={<div>Protected Content</div>} />
                </Route>
                <Route path="/login" element={<div>Login Page</div>} />
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

    test('shows access denied when user role does not match allowedRoles', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: true };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['admin'] });

        expect(screen.getByText('Access Denied')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test('allows access when user role is in allowedRoles', () => {
        mockAuthValue.user = { role: 'admin' };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['admin', 'municipal_admin'] });

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test('shows verification required for unverified reporter when requireVerified is true', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: false, verificationStatus: 'pending' };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['reporter'], requireVerified: true });

        expect(screen.getByText('Verification Required')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    test('allows verified reporter when requireVerified is true', () => {
        mockAuthValue.user = { role: 'reporter', isVerified: true, verificationStatus: 'approved' };
        mockAuthValue.isAuthenticated = true;
        mockAuthValue.loading = false;

        renderProtected({ allowedRoles: ['reporter'], requireVerified: true });

        expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    test('shows spinner when auth is loading', () => {
        mockAuthValue.user = null;
        mockAuthValue.isAuthenticated = false;
        mockAuthValue.loading = true;

        const { container } = renderProtected();

        expect(container.querySelector('.spinner')).toBeInTheDocument();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });
});
