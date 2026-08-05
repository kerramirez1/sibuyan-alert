import { act, render, screen } from '@testing-library/react';
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
        disconnect: vi.fn(),
    };
    const toast = vi.fn();
    toast.success = vi.fn();
    toast.error = vi.fn();
    return {
        listeners,
        socket,
        toast,
        user: {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        },
    };
});

vi.mock('socket.io-client', () => ({ io: () => mocks.socket }));
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user, isAuthenticated: true }),
}));
vi.mock('../utils/appToast', () => ({ default: mocks.toast }));
vi.mock('../utils/runtimeUrl', () => ({ resolveSocketOrigin: () => 'http://localhost:5000' }));
vi.mock('../services/api', () => ({ refreshAuthSession: vi.fn() }));

import { SocketProvider, useSocket } from '../context/SocketContext';

const Probe = () => {
    const { unreadCount } = useSocket();
    return <output aria-label="Unread notifications">{unreadCount}</output>;
};

const trigger = (event, payload) => {
    [...(mocks.listeners.get(event) || [])].forEach((handler) => handler(payload));
};

describe('SocketProvider notification policy', () => {
    beforeEach(() => {
        mocks.listeners.clear();
        mocks.socket.on.mockClear();
        mocks.socket.off.mockClear();
        mocks.socket.emit.mockClear();
        mocks.socket.disconnect.mockClear();
        mocks.toast.mockReset();
        mocks.toast.success.mockReset();
        mocks.toast.error.mockReset();
    });

    test('announces a response only to other responder units', () => {
        render(<SocketProvider><Probe /></SocketProvider>);

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

    test('keeps the persisted verified notification without showing a duplicate responder toast', () => {
        render(<SocketProvider><Probe /></SocketProvider>);

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

    test('removes only provider-owned listeners during cleanup', () => {
        const externalListener = vi.fn();
        mocks.listeners.set('notification', new Set([externalListener]));
        const { unmount } = render(<SocketProvider><Probe /></SocketProvider>);

        unmount();
        expect(mocks.listeners.get('notification')).toContain(externalListener);
    });
});
