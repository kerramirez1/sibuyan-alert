import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AdminUsersPage from '../pages/AdminUsersPage';

const mocks = vi.hoisted(() => ({
    getUsers: vi.fn(),
    verifyReporter: vi.fn(),
    deleteUser: vi.fn(),
    getProtected: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/api', () => ({
    adminAPI: {
        getUsers: mocks.getUsers,
        verifyReporter: mocks.verifyReporter,
        deleteUser: mocks.deleteUser,
    },
    filesAPI: {
        getProtected: mocks.getProtected,
    },
}));

vi.mock('../utils/appToast', () => ({
    default: mocks.toast,
}));

describe('AdminUsersPage', () => {
    const mockUsers = [
        {
            _id: 'user-1',
            name: 'Jayker Ramirez',
            email: 'ramirez.jayker@gmail.com',
            role: 'reporter',
            verificationStatus: 'pending',
            address: 'Cambijang, Cajidiocan',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastLogin: '2026-02-01T00:00:00.000Z',
            idDocument: '/api/files/507f191e810c19729de860ea',
            selfiePhoto: '/api/files/507f191e810c19729de860eb',
        },
        {
            _id: 'user-2',
            name: 'Maria Santos',
            email: 'maria@example.com',
            role: 'responder',
            verificationStatus: 'approved',
            address: 'Poblacion, San Fernando',
            createdAt: '2025-12-01T00:00:00.000Z',
            lastLogin: null,
            idDocument: null,
            selfiePhoto: null,
        },
    ];

    const mockStats = {
        totalUsers: 14,
        reporters: 8,
        pendingVerification: 2,
        responders: 4,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUsers.mockResolvedValue({
            data: {
                data: {
                    users: mockUsers,
                    stats: mockStats,
                },
            },
        });
    });

    test('renders page header, stat strip, and user directory table', async () => {
        render(<AdminUsersPage />);

        expect(await screen.findByRole('heading', { level: 1, name: 'Manage users' })).toBeInTheDocument();
        expect(screen.getByText(/View and verify reporter accounts/i)).toBeInTheDocument();
        expect(screen.getByText(/Sibuyan Island · Alert System Active/i)).toBeInTheDocument();

        // Stat strip scoped assertions
        const statStrip = await screen.findByLabelText('User directory summary');
        expect(within(statStrip).getByText('Total users')).toBeInTheDocument();
        expect(within(statStrip).getByText('14')).toBeInTheDocument();
        expect(within(statStrip).getByText('Reporters')).toBeInTheDocument();
        expect(within(statStrip).getByText('8')).toBeInTheDocument();
        expect(within(statStrip).getByText('Pending')).toBeInTheDocument();
        expect(within(statStrip).getByText('2')).toBeInTheDocument();
        expect(within(statStrip).getByText('Responders')).toBeInTheDocument();
        expect(within(statStrip).getByText('4')).toBeInTheDocument();

        // Table rows
        expect(screen.getAllByText('Jayker Ramirez')[0]).toBeInTheDocument();
        expect(screen.getAllByText('ramirez.jayker@gmail.com')[0]).toBeInTheDocument();
        expect(screen.getAllByText('Maria Santos')[0]).toBeInTheDocument();

        // Badges
        expect(screen.getAllByText('Reporter').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Responder').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    });

    test('allows searching and filtering users', async () => {
        render(<AdminUsersPage />);

        await screen.findByRole('heading', { level: 1, name: 'Manage users' });

        const searchInput = screen.getByPlaceholderText('Search by name or email...');
        fireEvent.change(searchInput, { target: { value: 'Jayker' } });
        fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

        expect(mocks.getUsers).toHaveBeenCalledWith(expect.objectContaining({ search: 'Jayker' }));

        const roleSelect = screen.getByLabelText('Filter by role');
        fireEvent.change(roleSelect, { target: { value: 'reporter' } });

        expect(mocks.getUsers).toHaveBeenCalledWith(expect.objectContaining({ role: 'reporter' }));
    });

    test('opens reporter verification modal and handles approval', async () => {
        mocks.verifyReporter.mockResolvedValue({ data: { success: true } });
        render(<AdminUsersPage />);

        const approveBtns = await screen.findAllByTitle('Approve reporter');
        fireEvent.click(approveBtns[0]);

        expect(screen.getByRole('heading', { name: 'Approve Reporter' })).toBeInTheDocument();

        const modal = screen.getByRole('dialog');
        const submitBtn = within(modal).getByRole('button', { name: /Approve/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mocks.verifyReporter).toHaveBeenCalledWith('user-1', {
                status: 'approved',
                feedback: '',
            });
            expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('approved successfully'));
        });
    });

    test('opens delete modal and handles user deletion', async () => {
        mocks.deleteUser.mockResolvedValue({ data: { success: true } });
        render(<AdminUsersPage />);

        const deleteButtons = await screen.findAllByTitle('Delete user');
        fireEvent.click(deleteButtons[0]);

        expect(screen.getByRole('heading', { name: 'Delete User' })).toBeInTheDocument();
        expect(screen.getByText(/Are you sure\?/i)).toBeInTheDocument();

        const modal = screen.getByRole('dialog');
        const confirmDeleteBtn = within(modal).getByRole('button', { name: 'Delete' });
        fireEvent.click(confirmDeleteBtn);

        await waitFor(() => {
            expect(mocks.deleteUser).toHaveBeenCalledWith('user-1');
            expect(mocks.toast.success).toHaveBeenCalledWith('User deleted successfully');
        });
    });

    test('renders empty state when no users are found', async () => {
        mocks.getUsers.mockResolvedValue({
            data: {
                data: {
                    users: [],
                    stats: mockStats,
                },
            },
        });

        render(<AdminUsersPage />);

        const emptyMessages = await screen.findAllByText('No users found');
        expect(emptyMessages.length).toBeGreaterThan(0);
        expect(screen.getAllByText('Try adjusting the search or filters.').length).toBeGreaterThan(0);
    });

    test('opens in-app document preview lightbox for ID and Selfie with document switching and Escape dismissal', async () => {
        const mockBlob = new Blob(['dummy-image-content'], { type: 'image/jpeg' });
        mocks.getProtected.mockResolvedValue({ data: mockBlob });

        // Mock window.open to ensure it is NEVER called
        const originalOpen = window.open;
        const windowOpenSpy = vi.fn();
        window.open = windowOpenSpy;

        // Mock URL.createObjectURL and URL.revokeObjectURL
        const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/dummy-id');
        const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

        try {
            render(<AdminUsersPage />);

            await screen.findByRole('heading', { level: 1, name: 'Manage users' });

            // Click ID document button
            const idButtons = screen.getAllByRole('button', { name: /View ID document for Jayker Ramirez/i });
            fireEvent.click(idButtons[0]);

            // Assert window.open was NOT called
            expect(windowOpenSpy).not.toHaveBeenCalled();

            // Lightbox opens inside the app
            expect(await screen.findByRole('heading', { name: 'Government ID' })).toBeInTheDocument();
            expect(screen.getAllByText('Jayker Ramirez').length).toBeGreaterThan(0);
            expect(screen.getByRole('button', { name: 'Close document preview' })).toBeInTheDocument();

            // Image loads from protected file API with centered canvas stage
            await waitFor(() => {
                expect(mocks.getProtected).toHaveBeenCalledWith('/api/files/507f191e810c19729de860ea');
                const idImg = screen.getByAltText('Government ID of Jayker Ramirez');
                expect(idImg).toBeInTheDocument();
                expect(idImg).toHaveClass('object-contain', 'max-w-full');
                const stage = screen.getByTestId('document-preview-stage');
                expect(stage).toBeInTheDocument();
                expect(stage).toHaveClass('overflow-auto');
            });

            // Zoom controls are present
            const zoomInBtn = screen.getByRole('button', { name: 'Zoom in' });
            fireEvent.click(zoomInBtn);
            expect(screen.getByText('125%')).toBeInTheDocument();

            // Switch to Selfie inside the lightbox
            const selfieTab = screen.getByRole('tab', { name: 'Selfie' });
            fireEvent.click(selfieTab);

            expect(await screen.findByRole('heading', { name: 'Verification Selfie' })).toBeInTheDocument();
            await waitFor(() => {
                expect(mocks.getProtected).toHaveBeenCalledWith('/api/files/507f191e810c19729de860eb');
                expect(screen.getByAltText('Verification Selfie of Jayker Ramirez')).toBeInTheDocument();
            });

            // Escape key closes the lightbox
            fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

            await waitFor(() => {
                expect(screen.queryByRole('heading', { name: 'Verification Selfie' })).not.toBeInTheDocument();
            });

            // Cleaned up blob URLs
            expect(revokeObjectURLSpy).toHaveBeenCalled();
        } finally {
            window.open = originalOpen;
            createObjectURLSpy.mockRestore();
            revokeObjectURLSpy.mockRestore();
        }
    });
});
