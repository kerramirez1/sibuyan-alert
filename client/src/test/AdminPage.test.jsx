import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: {
        id: 'responder-1',
        role: 'responder',
        assignedMunicipality: 'Cajidiocan',
    },
    callbacks: {},
    getResponder: vi.fn(),
    getAdmin: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (eventName, callback) => {
            mocks.callbacks[eventName] = callback;
            return () => {
                delete mocks.callbacks[eventName];
            };
        },
    }),
}));

vi.mock('../services/api', () => ({
    analyticsAPI: {
        getResponder: mocks.getResponder,
        getAdmin: mocks.getAdmin,
    },
    adminAPI: {},
}));

vi.mock('../components/dashboard/ResponderDashboardWorkspace', () => ({
    default: ({ error, loading, stats }) => (
        <div>
            <span>loading:{String(loading)}</span>
            <span>active:{stats?.activeIncidents ?? 'none'}</span>
            {error && <span>dashboard-error:{error}</span>}
        </div>
    ),
}));

const { default: AdminPage } = await import('../pages/AdminPage');

describe('AdminPage responder dashboard orchestration', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.callbacks = {};
        mocks.getResponder.mockResolvedValue({
            data: { data: { activeIncidents: 3 } },
        });
    });

    test('loads responder analytics from the public auth user shape', async () => {
        render(<AdminPage />);

        await waitFor(() => expect(screen.getByText('active:3')).toBeInTheDocument());
        expect(mocks.getResponder).toHaveBeenCalledOnce();
    });

    test('subscribes to report transfer and hazard lifecycle events', async () => {
        render(<AdminPage />);
        await waitFor(() => expect(mocks.getResponder).toHaveBeenCalledOnce());

        expect(Object.keys(mocks.callbacks)).toEqual(expect.arrayContaining([
            'reportTransferred',
            'highRiskZoneCreated',
            'highRiskZoneUpdated',
            'highRiskZoneDeleted',
        ]));
        expect(Object.keys(mocks.callbacks)).not.toEqual(expect.arrayContaining([
            'userOnline',
            'userOffline',
            'onlineUsersUpdate',
        ]));

        let scheduledRefresh;
        vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
            scheduledRefresh = callback;
            return 1;
        });
        act(() => {
            mocks.callbacks.reportTransferred({ id: 'report-1' });
            mocks.callbacks.highRiskZoneCreated({ _id: 'zone-1' });
        });

        await act(async () => {
            scheduledRefresh();
            await Promise.resolve();
        });

        expect(mocks.getResponder).toHaveBeenCalledTimes(2);
    });

    test('exposes analytics failures to the workspace', async () => {
        mocks.getResponder.mockRejectedValue({
            response: { data: { message: 'Analytics temporarily unavailable' } },
        });

        render(<AdminPage />);

        expect(await screen.findByText('dashboard-error:Analytics temporarily unavailable')).toBeInTheDocument();
        expect(screen.getByText('loading:false')).toBeInTheDocument();
    });
});

describe('AdminPage municipal admin dashboard rendering', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user = {
            id: 'admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getAdmin.mockResolvedValue({
            data: {
                data: {
                    reports: {
                        total: 24,
                        pending: 3,
                        thisMonth: 12,
                        thisWeek: 5,
                    },
                    users: {
                        total: 58,
                        pendingVerifications: 2,
                    },
                    reportsByBarangay: [
                        { barangay: 'Poblacion', count: 8, injured: 2, fatalities: 0 },
                        { barangay: 'Sugod', count: 4, injured: 0, fatalities: 1 },
                    ],
                    recentReports: [
                        {
                            _id: 'rep-1',
                            address: 'Main Highway, Poblacion',
                            status: 'pending',
                            createdAt: new Date().toISOString(),
                            reporter: { name: 'Juan Cruz' },
                        },
                    ],
                    recentUsers: [
                        {
                            _id: 'user-1',
                            name: 'Maria Santos',
                            email: 'maria@example.com',
                            role: 'reporter',
                        },
                    ],
                },
            },
        });
    });

    test('renders the unified municipal operations dashboard layout and metrics', async () => {
        render(<AdminPage />);

        expect(await screen.findByRole('heading', { level: 1, name: 'Operations dashboard' })).toBeInTheDocument();
        expect(screen.getByText(/System active · Sibuyan Island · Cajidiocan/i)).toBeInTheDocument();

        // 4-Stat Strip
        expect(screen.getByRole('link', { name: /Pending Reports: 3/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Pending Verifications: 2/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Total Reports: 24/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Total Users: 58/i })).toBeInTheDocument();

        // Secondary Utility Strip
        expect(screen.getByRole('link', { name: /High-Risk Zones/i })).toHaveAttribute('href', '/admin/zones');
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();

        // Barangay breakdown
        expect(screen.getByText('Incidents per barangay')).toBeInTheDocument();
        expect(screen.getByText('Poblacion')).toBeInTheDocument();
        expect(screen.getByText('8 incidents')).toBeInTheDocument();
        expect(screen.getByText('Sugod')).toBeInTheDocument();
        expect(screen.getByText('4 incidents')).toBeInTheDocument();

        // Presence section is removed (out of objectives).
        expect(screen.queryByText('Active personnel & users')).not.toBeInTheDocument();
        expect(screen.queryByText(/online$/i)).not.toBeInTheDocument();

        // Recent Reports & Recent Users
        expect(screen.getByText('Recent reports')).toBeInTheDocument();
        expect(screen.getByText('Main Highway, Poblacion')).toBeInTheDocument();
        expect(screen.getByText('Recent users')).toBeInTheDocument();
        expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    });
});
