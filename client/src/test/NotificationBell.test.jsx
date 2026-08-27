import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import NotificationBell from '../components/ui/NotificationBell';

const mocks = vi.hoisted(() => ({
    user: { role: 'reporter' },
    unreadCount: 2,
    setUnreadCount: vi.fn(),
    getAll: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        unreadCount: mocks.unreadCount,
        setUnreadCount: mocks.setUnreadCount,
        socket: null,
    }),
}));

vi.mock('../services/api', () => ({
    notificationsAPI: {
        getAll: mocks.getAll,
        getUnreadCount: mocks.getUnreadCount,
        markAsRead: mocks.markAsRead,
        markAllAsRead: mocks.markAllAsRead,
    },
}));

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const renderBell = () => render(
    <MemoryRouter initialEntries={['/']}>
        <NotificationBell />
        <LocationProbe />
    </MemoryRouter>
);

describe('NotificationBell incident communications popover', () => {
    const sampleNotifications = [
        {
            _id: 'notif-1',
            type: 'report_verified',
            title: 'Report verified',
            message: 'Your report in Poblacion has been verified by MDRRMO.',
            isRead: false,
            createdAt: '2026-08-22T08:00:00.000Z',
            data: {
                reportId: '64b100000000000000000001',
                address: 'Poblacion coastal road',
            },
        },
        {
            _id: 'notif-2',
            type: 'report_responding',
            title: 'Response active',
            message: 'A dispatch team is en route.',
            isRead: true,
            createdAt: '2026-08-22T07:30:00.000Z',
            data: {
                reportId: '64b100000000000000000001',
                address: 'Poblacion coastal road',
            },
        },
    ];

    beforeEach(() => {
        window.innerWidth = 1024;
        mocks.user = { role: 'reporter' };
        mocks.unreadCount = 1;
        mocks.getAll.mockReset();
        mocks.getUnreadCount.mockReset();
        mocks.markAsRead.mockReset();
        mocks.markAllAsRead.mockReset();
        mocks.setUnreadCount.mockReset();

        mocks.getUnreadCount.mockResolvedValue({ data: { data: { unreadCount: 1 } } });
        mocks.getAll.mockResolvedValue({
            data: {
                data: {
                    notifications: sampleNotifications,
                    unreadCount: 1,
                },
            },
        });
        mocks.markAsRead.mockResolvedValue({ data: { success: true } });
        mocks.markAllAsRead.mockResolvedValue({ data: { success: true } });
    });

    test('renders bell button with accessible unread label and opens panel on click', async () => {
        renderBell();

        const bellButton = screen.getByRole('button', { name: 'Notifications, 1 unread' });
        expect(bellButton).toBeInTheDocument();

        fireEvent.click(bellButton);

        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();
        expect(screen.getAllByText('Poblacion coastal road')).toHaveLength(2);
        expect(screen.getByText('Your report in Poblacion has been verified by MDRRMO.')).toBeInTheDocument();
    });

    test('filters notifications by Unread and switches back to All', async () => {
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();

        // Switch to unread
        const unreadTab = screen.getByRole('tab', { name: /Unread/i });
        fireEvent.click(unreadTab);

        expect(screen.getByText('Your report in Poblacion has been verified by MDRRMO.')).toBeInTheDocument();
        expect(screen.queryByText('A dispatch team is en route.')).not.toBeInTheDocument();

        // Switch back to All
        const allTab = screen.getByRole('tab', { name: /^All$/i });
        fireEvent.click(allTab);

        expect(screen.getByText('Your report in Poblacion has been verified by MDRRMO.')).toBeInTheDocument();
        expect(screen.getByText('A dispatch team is en route.')).toBeInTheDocument();
    });

    test('marks all notifications as read when clicking Mark all read', async () => {
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();

        const markAllBtn = screen.getByRole('button', { name: /Mark all read/i });
        fireEvent.click(markAllBtn);

        await waitFor(() => {
            expect(mocks.markAllAsRead).toHaveBeenCalledTimes(1);
            expect(mocks.setUnreadCount).toHaveBeenCalledWith(0);
        });
    });

    test('navigates to report target and marks notification as read when clicked', async () => {
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();

        const notifItem = screen.getByText('Your report in Poblacion has been verified by MDRRMO.');
        fireEvent.click(notifItem);

        await waitFor(() => {
            expect(mocks.markAsRead).toHaveBeenCalledWith('notif-1');
            expect(screen.getByTestId('location')).toHaveTextContent('/my-reports');
        });
    });

    test('dismisses panel when pressing Escape key', async () => {
        renderBell();

        const bellBtn = screen.getByRole('button', { name: 'Notifications, 1 unread' });
        fireEvent.click(bellBtn);
        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Incident communications' })).not.toBeInTheDocument();
        });
    });

    test('renders mobile bottom sheet with portaled backdrop at mobile viewport widths and dismisses on backdrop click', async () => {
        window.innerWidth = 390;
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

        const dialog = await screen.findByRole('dialog', { name: 'Incident communications' });
        expect(dialog).toBeInTheDocument();

        const backdrop = screen.getByTestId('notification-backdrop');
        expect(backdrop).toBeInTheDocument();

        fireEvent.click(backdrop);

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Incident communications' })).not.toBeInTheDocument();
        });
    });

    test('displays error message and recovers on clicking Try again', async () => {
        mocks.getAll.mockRejectedValueOnce(new Error('Network error'));
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

        expect(await screen.findByText(/Unable to load communications/i)).toBeInTheDocument();

        const tryAgainBtn = screen.getByRole('button', { name: /Try again/i });
        mocks.getAll.mockResolvedValueOnce({
            data: {
                data: {
                    notifications: sampleNotifications,
                    unreadCount: 1,
                },
            },
        });

        fireEvent.click(tryAgainBtn);

        expect(await screen.findByText('Your report in Poblacion has been verified by MDRRMO.')).toBeInTheDocument();
    });

    test('renders full long incident titles, addresses, and messages without truncation', async () => {
        const longNotification = {
            _id: 'notif-long',
            type: 'report_update',
            title: 'Urgent assistance requested for multiple vehicle collision with blocked roadway',
            message: 'Three passenger vehicles involved on slippery curve near mountain pass. Local responders and medical triage dispatched immediately.',
            isRead: false,
            createdAt: '2026-08-22T08:15:00.000Z',
            data: {
                reportId: '64b100000000000000000099',
                address: 'Sitio Upper Crossing, Barangay Mabini Highway km 34, San Fernando, Sibuyan Island',
                updatePreview: 'Three passenger vehicles involved on slippery curve near mountain pass. Local responders and medical triage dispatched immediately.',
                priority: 'urgent',
            },
        };

        mocks.getAll.mockResolvedValue({
            data: {
                data: {
                    notifications: [longNotification],
                    unreadCount: 1,
                },
            },
        });

        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));

        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();
        expect(screen.getByText('Sitio Upper Crossing, Barangay Mabini Highway km 34, San Fernando, Sibuyan Island')).toBeInTheDocument();
        expect(screen.getByText(/Three passenger vehicles involved on slippery curve/i)).toBeInTheDocument();
    });

    test('navigates to /notifications when clicking View full inbox', async () => {
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
        expect(await screen.findByRole('dialog', { name: 'Incident communications' })).toBeInTheDocument();

        const viewInboxBtn = screen.getByRole('button', { name: /View full inbox/i });
        fireEvent.click(viewInboxBtn);

        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/notifications');
            expect(screen.queryByRole('dialog', { name: 'Incident communications' })).not.toBeInTheDocument();
        });
    });

    test('traps focus inside the dialog and cycles between interactive elements on Tab and Shift+Tab', async () => {
        renderBell();

        fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
        const dialog = await screen.findByRole('dialog', { name: 'Incident communications' });
        expect(dialog).toBeInTheDocument();

        const interactiveElements = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        expect(interactiveElements.length).toBeGreaterThan(1);

        const firstElement = interactiveElements[0];
        const lastElement = interactiveElements[interactiveElements.length - 1];

        // Focus last element and press Tab -> should wrap to first element
        lastElement.focus();
        expect(document.activeElement).toBe(lastElement);

        fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
        expect(document.activeElement).toBe(firstElement);

        // Focus first element and press Shift+Tab -> should wrap to last element
        firstElement.focus();
        expect(document.activeElement).toBe(firstElement);

        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(lastElement);
    });
});
