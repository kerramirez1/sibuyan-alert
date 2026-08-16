import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: { role: 'municipal_admin' },
    callbacks: {},
    getAll: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    setUnreadCount: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        setUnreadCount: mocks.setUnreadCount,
        subscribe: (event, callback) => {
            mocks.callbacks[event] = callback;
            return vi.fn();
        },
    }),
}));

vi.mock('../services/api', () => ({
    notificationsAPI: {
        getAll: mocks.getAll,
        markAsRead: mocks.markAsRead,
        markAllAsRead: mocks.markAllAsRead,
    },
}));

import NotificationsPage from '../pages/NotificationsPage';

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const renderPage = () => render(
    <MemoryRouter initialEntries={['/notifications']}>
        <NotificationsPage />
        <LocationProbe />
    </MemoryRouter>
);

describe('operational notification inbox', () => {
    beforeEach(() => {
        mocks.callbacks = {};
        mocks.user = { role: 'municipal_admin' };
        mocks.getAll.mockReset();
        mocks.markAsRead.mockReset();
        mocks.markAllAsRead.mockReset();
        mocks.setUnreadCount.mockReset();
    });

    test('keeps a reporter update unread until its exact incident is opened', async () => {
        const reportId = '64b100000000000000000001';
        const updateId = '64b100000000000000000002';
        const notificationId = '64b100000000000000000003';
        mocks.getAll.mockResolvedValue({
            data: {
                data: {
                    unreadCount: 1,
                    notifications: [{
                        _id: notificationId,
                        type: 'report_update',
                        title: 'Urgent help requested',
                        message: 'Field Reporter: Another medical unit is needed.',
                        isRead: false,
                        createdAt: '2026-07-17T08:20:00.000Z',
                        data: {
                            reportId,
                            updateId,
                            tag: 'need_help',
                            address: 'Poblacion coastal road',
                            updatePreview: 'Another medical unit is needed.',
                        },
                    }],
                },
            },
        });

        renderPage();

        expect(await screen.findByText('Urgent help requested')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Urgent help requested/ }));

        await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
            `/admin/reports?report=${reportId}&source=notification&notification=${notificationId}&update=${updateId}`
        ));
        expect(mocks.markAsRead).not.toHaveBeenCalled();
    });

    test('marks ordinary notifications before navigating', async () => {
        const notificationId = '64b100000000000000000004';
        mocks.getAll.mockResolvedValue({
            data: {
                data: {
                    unreadCount: 1,
                    notifications: [{
                        _id: notificationId,
                        type: 'new_report',
                        title: 'New incident report',
                        message: 'A new report is waiting for review.',
                        isRead: false,
                        createdAt: '2026-07-17T08:20:00.000Z',
                        data: {},
                    }],
                },
            },
        });
        mocks.markAsRead.mockResolvedValue({ data: { data: { unreadCount: 0 } } });

        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: /New incident report/ }));

        await waitFor(() => expect(mocks.markAsRead).toHaveBeenCalledWith(notificationId));
        expect(screen.getByTestId('location')).toHaveTextContent('/admin/reports');
        expect(mocks.setUnreadCount).toHaveBeenCalledWith(0);
    });
});
