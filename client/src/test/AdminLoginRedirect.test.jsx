import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import { AuthProvider } from '../context/AuthContext';
import MainLayout from '../components/layout/MainLayout';
import App from '../App';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    adminAPI: {
        getReports: vi.fn().mockResolvedValue({ data: { success: true, data: { reports: [], total: 0 } } }),
        getStats: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        getUsers: vi.fn().mockResolvedValue({ data: { success: true, data: { users: [], total: 0 } } }),
        getRiskZones: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    },
    analyticsAPI: {
        getStats: vi.fn().mockResolvedValue({ data: { success: true, data: { totalIncidents: 0, activeIncidents: 0, responseReadiness: 100 } } }),
        getAdmin: vi.fn().mockResolvedValue({ data: { success: true, data: { totalIncidents: 0, activeIncidents: 0, responseReadiness: 100 } } }),
        getPublicSummary: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        getPublic: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    },
    reportsAPI: {
        getReports: vi.fn().mockResolvedValue({ data: { success: true, data: { reports: [], total: 0 } } }),
        getStats: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        getMyReports: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
        getMunicipalities: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    },
    highRiskZonesAPI: {
        getAll: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
        getById: vi.fn().mockResolvedValue({ data: { success: true, data: null } }),
        create: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        update: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
}));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="map-view" />,
}));

vi.mock('../services/pushNotifications', () => ({
    getPushState: vi.fn().mockResolvedValue({ supported: false, permission: 'default', subscribed: false }),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
}));

vi.mock('../utils/appToast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
    dismissActiveToast: vi.fn(),
}));

vi.mock('../components/ui/NotificationBell', () => ({
    default: () => <div data-testid="notification-bell" />,
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        unreadCount: 0,
        notifications: [],
        connected: true,
        isConnected: true,
        subscribe: vi.fn(() => () => {}),
        emit: vi.fn(),
        markAsRead: vi.fn(),
        markAllAsRead: vi.fn(),
        subscribeToIncident: vi.fn(),
        unsubscribeFromIncident: vi.fn(),
    }),
    SocketProvider: ({ children }) => <>{children}</>,
}));

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: new Proxy({}, {
        get: (_target, prop) => {
            const Component = ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...props }) => {
                const Tag = typeof prop === 'string' ? prop : 'div';
                return <Tag {...props}>{children}</Tag>;
            };
            return Component;
        },
    }),
}));

describe('Municipal Administrator Login Redirect and Navigation Contracts', () => {
    let currentUser = null;

    beforeEach(() => {
        vi.clearAllMocks();
        currentUser = null;

        api.get.mockImplementation(async (url) => {
            if (url === '/auth/me') {
                if (!currentUser) {
                    const err = new Error('Unauthenticated');
                    err.response = { status: 401, data: { success: false, message: 'Unauthenticated' } };
                    throw err;
                }
                return { data: { success: true, data: currentUser } };
            }
            return { data: { success: true, data: [] } };
        });

        api.post.mockImplementation(async (url, body) => {
            if (url === '/auth/login') {
                if (body.email.includes('admin')) {
                    currentUser = {
                        id: 'admin-1',
                        name: 'Admin Maria Santos',
                        email: body.email,
                        role: 'municipal_admin',
                        assignedMunicipality: 'Cajidiocan',
                    };
                } else if (body.email.includes('responder')) {
                    currentUser = {
                        id: 'responder-1',
                        name: 'MDRRMO Officer',
                        email: body.email,
                        role: 'responder',
                        agency: 'LGU',
                        assignedMunicipality: 'Cajidiocan',
                    };
                } else {
                    currentUser = {
                        id: 'reporter-1',
                        name: 'Juan Dela Cruz',
                        email: body.email,
                        role: 'reporter',
                        isVerified: true,
                    };
                }
                return { data: { success: true, data: { user: currentUser } } };
            }
            return { data: { success: true, data: {} } };
        });
    });

    test('1. Municipal administrator logs in with no previous destination and lands on Admin Dashboard (/admin)', async () => {
        render(
            <MemoryRouter initialEntries={['/login']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { name: 'email', value: 'admin@cajidiocan.gov.ph' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { name: 'password', value: 'AdminSecret123!' },
        });
        fireEvent.submit(screen.getByTestId('login-form'));

        await waitFor(() => {
            const operationsLink = screen.getByRole('link', { name: /Admin Dashboard/i });
            expect(operationsLink).toHaveAttribute('aria-current', 'page');
            expect(operationsLink).toHaveAttribute('href', '/admin');
        }, { timeout: 8000 });
    }, 12000);

    test('2. Municipal administrator logs in after requesting a protected admin page and returns to that page', async () => {
        render(
            <MemoryRouter initialEntries={['/admin/zones']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        // ProtectedRoute should redirect unauthenticated user to /login with state
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { name: 'email', value: 'admin@cajidiocan.gov.ph' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { name: 'password', value: 'AdminSecret123!' },
        });
        fireEvent.submit(screen.getByTestId('login-form'));

        await waitFor(() => {
            const zonesLink = screen.getByRole('link', { name: /Risk Zones/i });
            expect(zonesLink).toHaveAttribute('aria-current', 'page');
            expect(zonesLink).toHaveAttribute('href', '/admin/zones');
        }, { timeout: 4000 });
    });

    test('3. Municipal administrator does not land on Analytics Dashboard by default, but Analytics remains accessible via sidebar', async () => {
        const adminUser = {
            id: 'admin-1',
            name: 'Admin Maria Santos',
            email: 'admin@cajidiocan.gov.ph',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };

        api.get.mockResolvedValue({
            data: {
                success: true,
                data: adminUser,
            },
        });

        render(
            <MemoryRouter initialEntries={['/admin']}>
                <AuthProvider>
                    <MainLayout>
                        <div data-testid="admin-content">Operations Active Content</div>
                    </MainLayout>
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            // Admin Dashboard is highlighted
            expect(screen.getByRole('link', { name: /Admin Dashboard/i })).toHaveAttribute('aria-current', 'page');
            // Analytics Dashboard link is present in the sidebar
            const analyticsLink = screen.getByRole('link', { name: /Analytics Dashboard/i });
            expect(analyticsLink).toBeInTheDocument();
            expect(analyticsLink).toHaveAttribute('href', '/dashboard');
            expect(analyticsLink).not.toHaveAttribute('aria-current', 'page');
        }, { timeout: 4000 });
    });

    test('4. Reporter login redirects to /reporter', async () => {
        render(
            <MemoryRouter initialEntries={['/login']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        }, { timeout: 4000 });

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { name: 'email', value: 'reporter@example.com' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { name: 'password', value: 'ReporterPass123!' },
        });
        fireEvent.submit(screen.getByTestId('login-form'));

        await waitFor(() => {
            const reporterLink = screen.getByRole('link', { name: /Reporter Dashboard/i });
            expect(reporterLink).toHaveAttribute('aria-current', 'page');
            expect(reporterLink).toHaveAttribute('href', '/reporter');
        }, { timeout: 4000 });
    });

    test('5. Responder login redirects to /admin (Responder Dashboard)', async () => {
        render(
            <MemoryRouter initialEntries={['/login']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        }, { timeout: 4000 });

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { name: 'email', value: 'responder@cajidiocan.gov.ph' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { name: 'password', value: 'ResponderPass123!' },
        });
        fireEvent.submit(screen.getByTestId('login-form'));

        await waitFor(() => {
            const reportsLink = screen.getByRole('link', { name: /Responder Dashboard/i });
            expect(reportsLink).toHaveAttribute('aria-current', 'page');
            expect(reportsLink).toHaveAttribute('href', '/admin');
        }, { timeout: 8000 });
    }, 12000);

    test('6. Authenticated municipal administrator visiting /login is redirected to /admin', async () => {
        const adminUser = {
            id: 'admin-1',
            name: 'Admin Maria Santos',
            email: 'admin@cajidiocan.gov.ph',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        currentUser = adminUser;

        render(
            <MemoryRouter initialEntries={['/login']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            const operationsLink = screen.getByRole('link', { name: /Admin Dashboard/i });
            expect(operationsLink).toHaveAttribute('aria-current', 'page');
            expect(operationsLink).toHaveAttribute('href', '/admin');
        }, { timeout: 4000 });
    });

    test('7. Authenticated municipal administrator visiting /login?redirect=/admin/users returns to /admin/users', async () => {
        const adminUser = {
            id: 'admin-1',
            name: 'Admin Maria Santos',
            email: 'admin@cajidiocan.gov.ph',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        currentUser = adminUser;

        render(
            <MemoryRouter initialEntries={['/login?redirect=%2Fadmin%2Fusers']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            const usersLink = screen.getByRole('link', { name: /Users/i });
            expect(usersLink).toHaveAttribute('aria-current', 'page');
            expect(usersLink).toHaveAttribute('href', '/admin/users');
        }, { timeout: 4000 });
    });

    test('8. Fresh app open on / sends an authenticated admin straight to Admin Dashboard', async () => {
        currentUser = {
            id: 'admin-1',
            name: 'Admin Maria Santos',
            email: 'admin@cajidiocan.gov.ph',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };

        render(
            <MemoryRouter initialEntries={['/']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            const adminLink = screen.getByRole('link', { name: /Admin Dashboard/i });
            expect(adminLink).toHaveAttribute('aria-current', 'page');
            expect(adminLink).toHaveAttribute('href', '/admin');
        }, { timeout: 4000 });
    });

    test('9. Fresh app open on /dashboard sends a reporter to Reporter Dashboard', async () => {
        currentUser = {
            id: 'reporter-1',
            name: 'Juan Dela Cruz',
            email: 'reporter@example.com',
            role: 'reporter',
            isVerified: true,
        };

        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            const reporterLink = screen.getByRole('link', { name: /Reporter Dashboard/i });
            expect(reporterLink).toHaveAttribute('aria-current', 'page');
        }, { timeout: 4000 });
    });

    test('10. Fresh app open preserves report deep links instead of forcing the dashboard', async () => {
        currentUser = {
            id: 'admin-1',
            name: 'Admin Maria Santos',
            email: 'admin@cajidiocan.gov.ph',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };

        render(
            <MemoryRouter initialEntries={['/dashboard?report=report-1']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            // Still on the dashboard route: the admin home link is not active.
            const adminLink = screen.getByRole('link', { name: /Admin Dashboard/i });
            expect(adminLink).not.toHaveAttribute('aria-current', 'page');
        }, { timeout: 4000 });
    });

    test('11. Login with a cross-role redirect still lands on the role dashboard', async () => {
        render(
            <MemoryRouter initialEntries={['/login?redirect=%2Fadmin%2Fusers']}>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        }, { timeout: 4000 });

        fireEvent.change(screen.getByLabelText('Email Address'), {
            target: { name: 'email', value: 'reporter@example.com' },
        });
        fireEvent.change(screen.getByLabelText('Password'), {
            target: { name: 'password', value: 'ReporterPass123!' },
        });
        fireEvent.submit(screen.getByTestId('login-form'));

        await waitFor(() => {
            const reporterLink = screen.getByRole('link', { name: /Reporter Dashboard/i });
            expect(reporterLink).toHaveAttribute('aria-current', 'page');
        }, { timeout: 4000 });
    });
});
