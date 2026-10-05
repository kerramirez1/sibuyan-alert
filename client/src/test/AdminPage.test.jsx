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
    renderCount: 0,
    connectivity: { isOffline: false },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user }),
}));

// The 45s revalidation interval gates on the server-liveness probe; the real
// hook's /api/health probe has no server to answer in jsdom and would flip
// these suites offline mid-test.
vi.mock('../hooks/useConnectivity', () => ({
    useConnectivity: () => ({
        isOnline: !mocks.connectivity.isOffline,
        isOffline: mocks.connectivity.isOffline,
        lastChangedAt: null,
        probeNow: async () => !mocks.connectivity.isOffline,
    }),
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
    systemAPI: { getHealth: vi.fn().mockResolvedValue({ data: { success: true } }) },
}));

vi.mock('../components/dashboard/ResponderDashboardWorkspace', () => ({
    default: ({ error, loading, stats }) => {
        mocks.renderCount += 1;
        return (
            <div>
                <span>loading:{String(loading)}</span>
                <span>active:{stats?.activeIncidents ?? 'none'}</span>
                {error && <span>dashboard-error:{error}</span>}
            </div>
        );
    },
}));

const { default: AdminPage } = await import('../pages/AdminPage');

describe('AdminPage responder route orchestration', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.callbacks = {};
        mocks.renderCount = 0;
        mocks.connectivity.isOffline = false;
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

describe('AdminPage dashboard rendering', () => {
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

    test('renders the unified dashboard layout and metrics', async () => {
        render(<AdminPage />);

        expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
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

    test('caps the barangay breakdown at five rows with a view-all link', async () => {
        mocks.getAdmin.mockResolvedValue({
            data: {
                data: {
                    reports: { total: 20, pending: 0, thisMonth: 9, thisWeek: 2 },
                    users: { total: 10, pendingVerifications: 0 },
                    reportsByBarangay: [
                        { barangay: 'B1', count: 7 },
                        { barangay: 'B2', count: 6 },
                        { barangay: 'B3', count: 5 },
                        { barangay: 'B4', count: 4 },
                        { barangay: 'B5', count: 3 },
                        { barangay: 'B6', count: 2 },
                        { barangay: 'B7', count: 1 },
                    ],
                    recentReports: [],
                    recentUsers: [],
                },
            },
        });

        render(<AdminPage />);

        expect(await screen.findByText('7 barangays recorded')).toBeInTheDocument();
        expect(screen.getByText('B5')).toBeInTheDocument();
        expect(screen.queryByText('B6')).not.toBeInTheDocument();
        expect(screen.queryByText('B7')).not.toBeInTheDocument();
        // Analytics is the opt-in dashboard view now, so the deep link has to
        // name it — `/dashboard` alone opens the incident map.
        expect(screen.getByRole('link', { name: 'View all 7 barangays in analytics' }))
            .toHaveAttribute('href', '/dashboard?view=analytics');
    });
});

describe('AdminPage weak-signal intervals', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.callbacks = {};
        mocks.renderCount = 0;
        mocks.connectivity.isOffline = false;
        // An earlier describe swaps in a municipal_admin user; these tests
        // exercise the responder route.
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getResponder.mockResolvedValue({
            data: { data: { activeIncidents: 3 } },
        });
    });

    test('ticks the updated clock every 10s and skips the tick in a hidden tab', async () => {
        vi.useFakeTimers();
        const intervalSpy = vi.spyOn(window, 'setInterval');

        render(<AdminPage />);
        await act(async () => {});

        // The tick is registered at 10s (was 1s): no more per-second
        // full-dashboard re-renders.
        const delays = intervalSpy.mock.calls.map(([, delay]) => delay);
        expect(delays).toContain(10000);
        expect(delays).not.toContain(1000);
        const rendersAfterMount = mocks.renderCount;
        expect(rendersAfterMount).toBeGreaterThan(0);

        // Visible tab: 10s elapse, the tick fires, the clock re-renders.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(mocks.renderCount).toBeGreaterThan(rendersAfterMount);

        // Hidden tab: the interval still fires, but the tick is skipped
        // instead of burning CPU/battery on a dashboard nobody is looking at.
        const rendersBeforeHidden = mocks.renderCount;
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        try {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000);
            });
        } finally {
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        }
        expect(mocks.renderCount).toBe(rendersBeforeHidden);
    });

    test('revalidates every 45s while online, skips while the server is unreachable', async () => {
        vi.useFakeTimers();
        const { clearQueryCache } = await import('../utils/queryCache');
        clearQueryCache();

        const { rerender } = render(<AdminPage />);
        await act(async () => {});
        expect(mocks.getResponder).toHaveBeenCalledTimes(1);

        // 45s while the server is reachable: silent revalidation fires.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(45000);
        });
        expect(mocks.getResponder).toHaveBeenCalledTimes(2);

        // 45s while the server is unreachable: skipped — revalidating into a
        // dead link only burns radio/battery for a doomed request.
        mocks.connectivity.isOffline = true;
        rerender(<AdminPage />);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(45000);
        });
        expect(mocks.getResponder).toHaveBeenCalledTimes(2);
    });

    test('midnight rollover still force-refreshes even while the server is unreachable', async () => {
        vi.useFakeTimers();
        const { clearQueryCache } = await import('../utils/queryCache');
        clearQueryCache();
        // 23:59:50 Manila time: the next 45s tick crosses midnight.
        vi.setSystemTime(new Date('2026-10-04T15:59:50Z'));
        mocks.connectivity.isOffline = true;

        render(<AdminPage />);
        await act(async () => {});
        expect(mocks.getResponder).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(45000);
        });
        // The rollover branch is not gated on reachability: the calendar day
        // changed, so the dashboard force-refreshes regardless.
        expect(mocks.getResponder).toHaveBeenCalledTimes(2);
    });
});
