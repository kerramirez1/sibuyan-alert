import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from '../router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    analyticsAPI: {
        getPublic: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        getAdmin: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    },
    reportsAPI: {
        getMunicipalities: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
    },
    adminAPI: {
        getReports: vi.fn().mockResolvedValue({ data: { success: true, data: { reports: [], total: 0 } } }),
        getStats: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
        getUsers: vi.fn().mockResolvedValue({ data: { success: true, data: { users: [], total: 0 } } }),
        getRiskZones: vi.fn().mockResolvedValue({ data: { success: true, data: [] } }),
        getPresence: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    },
}));

vi.mock('../services/pushNotifications', () => ({
    getPushState: vi.fn().mockResolvedValue({ supported: false, permission: 'default', subscribed: false }),
    subscribeToPush: vi.fn(),
    unsubscribeFromPush: vi.fn(),
    isPushSupported: vi.fn().mockReturnValue(false),
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

// AdminPage pulls the operational map workspace through
// ResponderDashboardWorkspace; maplibre-gl cannot load in jsdom.
vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="map-view" />,
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

const AUTH_HINT_KEY = 'sibuyan-alert:auth-hint';

const adminUser = {
    id: 'admin-1',
    name: 'Admin Maria Santos',
    email: 'admin@cajidiocan.gov.ph',
    role: 'municipal_admin',
    assignedMunicipality: 'Cajidiocan',
};

const unauthenticatedError = () => {
    const err = new Error('Unauthenticated');
    err.response = { status: 401, data: { success: false, message: 'Unauthenticated' } };
    return err;
};

describe('App shell renders public routes without waiting for the session check', () => {
    let resolveAuthMe;
    let rejectAuthMe;

    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        resolveAuthMe = undefined;
        rejectAuthMe = undefined;

        api.get.mockImplementation((url) => {
            if (url === '/auth/me') {
                return new Promise((resolve, reject) => {
                    resolveAuthMe = resolve;
                    rejectAuthMe = reject;
                });
            }
            return Promise.resolve({ data: { success: true, data: [] } });
        });
    });

    const renderAppAt = (entry) => render(
        <MemoryRouter initialEntries={[entry]}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </MemoryRouter>,
    );

    test('landing page paints while /auth/me is still pending when there is no session hint', async () => {
        renderAppAt('/');

        // With the old blanket loader this times out: the page waited for the
        // session check before painting anything.
        await waitFor(() => {
            expect(screen.getByTestId('sibuyan-island-map')).toBeInTheDocument();
        });
        expect(screen.queryByText('Loading application...')).not.toBeInTheDocument();

        // The pending check resolving as signed-out keeps the landing visible
        // and the header in its signed-out state.
        rejectAuthMe(unauthenticatedError());
        await waitFor(() => {
            expect(screen.getByTestId('sibuyan-island-map')).toBeInTheDocument();
        });
        const header = screen.getByRole('banner');
        expect(within(header).getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    });

    test('boot loader is kept while /auth/me is pending when a session hint exists', async () => {
        window.localStorage.setItem(AUTH_HINT_KEY, '1');
        renderAppAt('/');

        // Returning visitors hold the loader so the role redirect below can
        // fire without flashing the landing page first.
        expect(screen.getByText('Loading application...')).toBeInTheDocument();
        expect(screen.queryByTestId('sibuyan-island-map')).not.toBeInTheDocument();

        // The existing boot redirect still fires once the check resolves:
        // the admin lands on their dashboard (sidebar link becomes current).
        resolveAuthMe({ data: { success: true, data: adminUser } });
        await waitFor(() => {
            const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
            expect(dashboardLink).toHaveAttribute('href', '/admin');
            expect(dashboardLink).toHaveAttribute('aria-current', 'page');
        }, { timeout: 8000 });
        expect(screen.queryByTestId('sibuyan-island-map')).not.toBeInTheDocument();
    });

    test('protected routes show the secure skeleton — never protected content — while the check is pending', async () => {
        renderAppAt('/admin');

        await waitFor(() => {
            expect(screen.getByText('Loading secure page...')).toBeInTheDocument();
        });
        // The sidebar nav renders, but the protected page itself (its heading)
        // must not leak while the session check is pending.
        expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();

        // Signed-out resolution still bounces to /login with the redirect target.
        rejectAuthMe(unauthenticatedError());
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Sign in to Sibuyan Alert/i })).toBeInTheDocument();
        });
    });

    test('session hint is cleared on logout so the next visit paints instantly', async () => {
        window.localStorage.setItem(AUTH_HINT_KEY, '1');
        api.post.mockResolvedValue({ data: { success: true, data: {} } });
        renderAppAt('/');

        resolveAuthMe({ data: { success: true, data: adminUser } });
        await waitFor(() => {
            const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
            expect(dashboardLink).toHaveAttribute('href', '/admin');
            expect(dashboardLink).toHaveAttribute('aria-current', 'page');
        }, { timeout: 8000 });
        expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBe('1');

        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
        await waitFor(() => {
            expect(window.localStorage.getItem(AUTH_HINT_KEY)).toBeNull();
        });
        // Signed-out users land back on the instantly-painted landing page.
        await waitFor(() => {
            expect(screen.getByTestId('sibuyan-island-map')).toBeInTheDocument();
        });
    });
});
