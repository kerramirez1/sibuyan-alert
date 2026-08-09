import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: {
        id: 'responder-1',
        role: 'responder',
        assignedMunicipality: 'Cajidiocan',
    },
    callbacks: {},
    getResponder: vi.fn(),
    getAdmin: vi.fn(),
    getOnlineUsers: vi.fn(),
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
    adminAPI: {
        getOnlineUsers: mocks.getOnlineUsers,
    },
}));

vi.mock('../components/dashboard/ResponderDashboardWorkspace', () => ({
    default: ({ error, onlineUsersError, loading, stats, onlineUsers }) => (
        <div>
            <span>loading:{String(loading)}</span>
            <span>active:{stats?.activeIncidents ?? 'none'}</span>
            <span>online:{onlineUsers.length}</span>
            {error && <span>dashboard-error:{error}</span>}
            {onlineUsersError && <span>presence-error:{onlineUsersError}</span>}
        </div>
    ),
}));

const { default: AdminPage } = await import('../pages/AdminPage');

describe('AdminPage responder dashboard orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.callbacks = {};
        mocks.getResponder.mockResolvedValue({
            data: { data: { activeIncidents: 3 } },
        });
        mocks.getOnlineUsers.mockResolvedValue({
            data: { data: [{ userId: 'responder-1', role: 'responder' }] },
        });
    });

    test('loads responder analytics and operational presence from the public auth user shape', async () => {
        render(<AdminPage />);

        await waitFor(() => expect(screen.getByText('active:3')).toBeInTheDocument());
        expect(screen.getByText('online:1')).toBeInTheDocument();
        expect(mocks.getResponder).toHaveBeenCalledOnce();
        expect(mocks.getOnlineUsers).toHaveBeenCalledWith({ municipality: 'Cajidiocan' });
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

        act(() => {
            mocks.callbacks.reportTransferred({ id: 'report-1' });
            mocks.callbacks.highRiskZoneCreated({ _id: 'zone-1' });
        });

        await waitFor(
            () => expect(mocks.getResponder).toHaveBeenCalledTimes(2),
            { timeout: 3000 },
        );
    });

    test('exposes separate analytics and presence failures to the workspace', async () => {
        mocks.getResponder.mockRejectedValue({
            response: { data: { message: 'Analytics temporarily unavailable' } },
        });
        mocks.getOnlineUsers.mockRejectedValue({
            response: { data: { message: 'Presence temporarily unavailable' } },
        });

        render(<AdminPage />);

        expect(await screen.findByText('dashboard-error:Analytics temporarily unavailable')).toBeInTheDocument();
        expect(screen.getByText('presence-error:Presence temporarily unavailable')).toBeInTheDocument();
        expect(screen.getByText('loading:false')).toBeInTheDocument();
    });
});
