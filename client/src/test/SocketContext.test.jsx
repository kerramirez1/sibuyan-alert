import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const listeners = new Map();
    const socket = {
        connected: true,
        on: vi.fn((event, handler) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
        }),
        off: vi.fn((event, handler) => {
            if (handler) listeners.get(event)?.delete(handler);
            else listeners.delete(event);
        }),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };
    const toast = vi.fn();
    toast.success = vi.fn();
    toast.error = vi.fn();
    const ioMock = vi.fn(() => socket);
    const user = {
        _id: 'responder-1',
        role: 'responder',
        assignedMunicipality: 'Cajidiocan',
    };
    return {
        listeners,
        socket,
        ioMock,
        toast,
        user,
        authUser: user,
        isAuthenticated: true,
    };
});

vi.mock('socket.io-client', () => ({ io: mocks.ioMock }));
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.authUser, isAuthenticated: mocks.isAuthenticated }),
}));
vi.mock('../utils/appToast', () => ({ default: mocks.toast }));
vi.mock('../utils/runtimeUrl', () => ({ resolveSocketOrigin: () => 'http://localhost:5000' }));
vi.mock('../services/api', () => ({ refreshAuthSession: vi.fn() }));

import { SocketProvider, useSocket } from '../context/SocketContext';

const Probe = () => {
    const { unreadCount, reconnectVersion, reconnect } = useSocket();
    return (
        <>
            <output aria-label="Unread notifications">{unreadCount}</output>
            <output aria-label="Reconnect version">{reconnectVersion}</output>
            <button type="button" onClick={reconnect}>Manual Reconnect</button>
        </>
    );
};

const trigger = (event, payload) => {
    [...(mocks.listeners.get(event) || [])].forEach((handler) => handler(payload));
};

// The connection is established after a dynamic import, so every test that
// touches the socket waits for the io() call to land first.
const renderConnected = async () => {
    const result = render(<SocketProvider><Probe /></SocketProvider>);
    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalledTimes(1));
    return result;
};

describe('SocketProvider notification policy', () => {
    beforeEach(() => {
        mocks.listeners.clear();
        mocks.socket.on.mockClear();
        mocks.socket.off.mockClear();
        mocks.socket.emit.mockClear();
        mocks.socket.connect.mockClear();
        mocks.socket.disconnect.mockClear();
        mocks.ioMock.mockClear();
        mocks.toast.mockReset();
        mocks.toast.success.mockReset();
        mocks.toast.error.mockReset();
        mocks.authUser = mocks.user;
        mocks.isAuthenticated = true;
        mocks.socket.connected = true;
    });

    test('reconnects indefinitely with rapid capped exponential backoff and jitter', async () => {
        await renderConnected();

        expect(mocks.ioMock).toHaveBeenCalledWith('http://localhost:5000', expect.objectContaining({
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            randomizationFactor: 0.5,
        }));
    });

    test('triggers reconnect immediately when manual reconnect is invoked while disconnected', async () => {
        await renderConnected();
        mocks.socket.connected = false;

        act(() => {
            screen.getByText('Manual Reconnect').click();
        });

        expect(mocks.socket.connect).toHaveBeenCalledTimes(1);
    });

    test('reconnects when tab becomes visible and socket is disconnected', async () => {
        await renderConnected();
        mocks.socket.connected = false;

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(mocks.socket.connect).toHaveBeenCalledTimes(1);
    });

    test('reconnects immediately when server sends io server disconnect', async () => {
        await renderConnected();
        mocks.socket.connect.mockClear();

        act(() => trigger('disconnect', 'io server disconnect'));

        expect(mocks.socket.connect).toHaveBeenCalledTimes(1);
    });

    test('signals consumers to resync only after a reconnect, not the initial connection', async () => {
        await renderConnected();
        expect(screen.getByLabelText('Reconnect version')).toHaveTextContent('0');

        act(() => trigger('connect'));
        expect(screen.getByLabelText('Reconnect version')).toHaveTextContent('0');

        act(() => trigger('disconnect'));
        act(() => trigger('connect'));
        expect(screen.getByLabelText('Reconnect version')).toHaveTextContent('1');

        act(() => trigger('connect'));
        expect(screen.getByLabelText('Reconnect version')).toHaveTextContent('2');
    });

    test('announces a response only to other responder units', async () => {
        await renderConnected();

        act(() => trigger('localUnitResponse', {
            reportId: 'report-1',
            responder: { _id: 'responder-1', unitName: 'MDRRMO - Cajidiocan' },
        }));
        expect(mocks.toast).not.toHaveBeenCalled();

        act(() => trigger('localUnitResponse', {
            reportId: 'report-1',
            responder: { _id: 'responder-2', unitName: 'PNP - Cajidiocan' },
        }));
        expect(mocks.toast).toHaveBeenCalledTimes(1);
        expect(mocks.toast).toHaveBeenCalledWith('PNP - Cajidiocan is responding', {
            dedupeKey: 'unit-response:report-1:responder-2',
        });
    });

    test('keeps the persisted verified notification without showing a duplicate responder toast', async () => {
        await renderConnected();

        act(() => trigger('reportVerifiedAlert', {
            id: 'report-1',
            incidentType: 'Vehicular collision',
            address: 'J. Rizal Street',
        }));
        expect(mocks.toast).toHaveBeenCalledTimes(1);

        const notification = {
            _id: 'notification-1',
            type: 'report_verified',
            message: 'A verified incident requires response.',
            data: { reportId: 'report-1' },
        };
        act(() => trigger('notification', notification));
        expect(mocks.toast).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Unread notifications')).toHaveTextContent('1');

        act(() => trigger('notification', notification));
        expect(screen.getByLabelText('Unread notifications')).toHaveTextContent('1');
    });

    test('removes only provider-owned listeners during cleanup', async () => {
        const externalListener = vi.fn();
        mocks.listeners.set('notification', new Set([externalListener]));
        const { unmount } = await renderConnected();

        unmount();
        expect(mocks.listeners.get('notification')).toContain(externalListener);
    });

    test('announces newly verified incidents to guest viewers only', async () => {
        await renderConnected();

        // Authenticated responder: no public popup (has scoped alerts instead).
        act(() => trigger('reportVerified', {
            id: 'report-9',
            incidentType: 'Vehicular collision',
            address: 'J. Rizal Street',
        }));
        expect(mocks.toast.success).not.toHaveBeenCalled();

        // Guest viewer: popup announcement with dedupe key.
        mocks.authUser = null;
        try {
            render(<SocketProvider><Probe /></SocketProvider>);
            await waitFor(() => expect(mocks.ioMock).toHaveBeenCalledTimes(2));
            act(() => trigger('reportVerified', {
                id: 'report-9',
                incidentType: 'Vehicular collision',
                address: 'J. Rizal Street',
            }));
            expect(mocks.toast.success).toHaveBeenCalledWith(
                'New verified incident on the map: Vehicular collision at J. Rizal Street',
                { dedupeKey: 'public-verified:report-9' },
            );

            // Malformed payloads never crash the popup.
            act(() => trigger('reportVerified', null));
            expect(mocks.toast.success).toHaveBeenCalledTimes(1);
        } finally {
            mocks.authUser = mocks.user;
        }
    });

    test('creates no socket for unauthenticated visitors', async () => {
        mocks.authUser = null;
        mocks.isAuthenticated = false;

        render(<SocketProvider><Probe /></SocketProvider>);

        // Give the dynamic import every chance to resolve: if the provider
        // were connecting anonymously, io() would have been called by now.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });

        expect(mocks.ioMock).not.toHaveBeenCalled();
    });

    test('subscribe is a safe no-op when there is no socket', async () => {
        mocks.authUser = null;
        mocks.isAuthenticated = false;

        let unsubscribe;
        const SubscribeProbe = () => {
            const { subscribe } = useSocket();
            unsubscribe = subscribe('newReport', () => {
                throw new Error('must never be called without a socket');
            });
            return null;
        };
        render(<SocketProvider><SubscribeProbe /></SocketProvider>);

        expect(typeof unsubscribe).toBe('function');
        expect(() => unsubscribe()).not.toThrow();
        expect(mocks.socket.on).not.toHaveBeenCalled();
    });

    test('disconnects and drops the socket when the user logs out', async () => {
        const { rerender } = await renderConnected();

        mocks.authUser = null;
        mocks.isAuthenticated = false;
        rerender(<SocketProvider><Probe /></SocketProvider>);

        expect(mocks.socket.disconnect).toHaveBeenCalled();
    });
});
