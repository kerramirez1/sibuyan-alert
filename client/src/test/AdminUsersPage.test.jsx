import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AdminUsersPage from '../pages/AdminUsersPage';

const mocks = vi.hoisted(() => ({
    getUsers: vi.fn(),
    verifyReporter: vi.fn(),
    deleteUser: vi.fn(),
    createResponder: vi.fn(),
    createAdmin: vi.fn(),
    resendResponderInvitation: vi.fn(),
    getProtected: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../services/api', () => ({
    adminAPI: {
        getUsers: mocks.getUsers,
        verifyReporter: mocks.verifyReporter,
        deleteUser: mocks.deleteUser,
        createResponder: mocks.createResponder,
        createAdmin: mocks.createAdmin,
        resendResponderInvitation: mocks.resendResponderInvitation,
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

    /**
     * Provisioning a responder. The form exists so an administrator can add a
     * colleague without ever handling a credential — so the assertions that
     * matter most are about what the form does NOT send.
     */
    describe('add responder', () => {
        const openForm = async () => {
            render(<AdminUsersPage />);
            // The directory renders a desktop table and a mobile card list, so
            // every user appears twice.
            await screen.findAllByText('Jayker Ramirez');
            fireEvent.click(screen.getByRole('button', { name: 'Add a user account' }));
            await screen.findByRole('heading', { name: 'Add user' });
        };

        const fillForm = () => {
            fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan Dela Cruz' } });
            fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'juan@example.com' } });
            fireEvent.change(screen.getByLabelText('Agency'), { target: { value: 'MDRRMO' } });
        };

        const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create and send invitation' }));

        test('offers only the agencies a new responder may be given', async () => {
            await openForm();

            const options = within(screen.getByLabelText('Agency'))
                .getAllByRole('option')
                .map((option) => option.textContent);

            expect(options).toEqual(['Select an agency', 'MDRRMO', 'PNP', 'BFP', 'Medical Team', 'Barangay']);
            // Removed from the intake, not from storage: existing accounts keep
            // their value and the server still stores it.
            expect(options).not.toContain('Rescue');
            expect(options).not.toContain('Medical');
        });

        test('sends only the collected fields — never a role, municipality, or password', async () => {
            mocks.createResponder.mockResolvedValue({
                data: { data: { invitationSent: true, message: 'Invitation sent to juan@example.com' } },
            });

            await openForm();
            fillForm();
            submit();

            await waitFor(() => expect(mocks.createResponder).toHaveBeenCalledTimes(1));

            const payload = mocks.createResponder.mock.calls[0][0];
            expect(payload).toEqual({
                name: 'Juan Dela Cruz',
                email: 'juan@example.com',
                agency: 'MDRRMO',
            });
            // No responder-unit field on the form any more.
            expect(payload).not.toHaveProperty('responderUnit');
            // The server owns all three; the client has no business sending them.
            expect(payload).not.toHaveProperty('role');
            expect(payload).not.toHaveProperty('assignedMunicipality');
            expect(payload).not.toHaveProperty('password');
        });

        test('surfaces the duplicate-email message the server sent', async () => {
            mocks.createResponder.mockRejectedValue({
                response: {
                    data: {
                        success: false,
                        code: 'EMAIL_IN_USE',
                        message: 'An account with this email already exists',
                    },
                },
            });

            await openForm();
            fillForm();
            submit();

            expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists');
        });

        test('marks the field the server rejected instead of only showing a banner', async () => {
            mocks.createResponder.mockRejectedValue({
                response: {
                    data: {
                        success: false,
                        message: 'Validation failed',
                        errors: [{ field: 'email', message: 'Please enter a valid email' }],
                    },
                },
            });

            await openForm();
            fillForm();
            submit();

            expect(await screen.findByText('Please enter a valid email')).toBeInTheDocument();
            expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
        });

        test('keeps the created account and offers a retry when the email failed', async () => {
            mocks.createResponder.mockResolvedValue({
                data: {
                    data: {
                        invitationSent: false,
                        message: 'Account created, but the invitation email could not be sent. Use "Resend invitation" to try again.',
                        user: { id: 'new-1', name: 'Juan Dela Cruz', email: 'juan@example.com' },
                    },
                },
            });
            mocks.resendResponderInvitation.mockResolvedValue({
                data: { data: { invitationSent: true, message: 'Invitation sent' } },
            });

            await openForm();
            fillForm();
            submit();

            // Not a dead end: the account is held on screen and the retry is the
            // only remaining action.
            expect(await screen.findByRole('status')).toHaveTextContent(/could not be sent/i);
            expect(screen.getByText(/juan@example\.com/)).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

            await waitFor(() => expect(mocks.resendResponderInvitation).toHaveBeenCalledWith('new-1'));
        });

        test('keeps the retry available when resending fails at the mail server', async () => {
            mocks.createResponder.mockResolvedValue({
                data: {
                    data: {
                        invitationSent: false,
                        message: 'Account created, but the invitation email could not be sent. Use "Resend invitation" to try again.',
                        user: { id: 'new-1', name: 'Juan Dela Cruz', email: 'juan@example.com' },
                    },
                },
            });
            mocks.resendResponderInvitation.mockRejectedValue({
                response: {
                    status: 502,
                    data: {
                        success: false,
                        code: 'INVITATION_DELIVERY_FAILED',
                        message: 'The invitation email could not be sent (email delivery is not configured on the server (SMTP)). Fix the server configuration and try again.',
                    },
                },
            });

            await openForm();
            fillForm();
            submit();

            await screen.findByRole('status');

            fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));

            // The server's cause is shown verbatim, and the modal is not a dead
            // end: the retry and the held account stay on screen.
            expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
            expect(screen.getByRole('button', { name: 'Resend invitation' })).toBeInTheDocument();
            expect(screen.getByText(/juan@example\.com/)).toBeInTheDocument();
        });

        test('refreshes the scoped list after a successful invitation', async () => {
            mocks.createResponder.mockResolvedValue({
                data: { data: { invitationSent: true, message: 'Invitation sent' } },
            });

            await openForm();
            const callsBefore = mocks.getUsers.mock.calls.length;

            fillForm();
            submit();

            await waitFor(() => expect(mocks.getUsers.mock.calls.length).toBeGreaterThan(callsBefore));
        });
    });

    /**
     * Provisioning a municipal_admin for the administrator's own municipality.
     * The dialog is unified: one button, one dialog, an account-type selector.
     * The assertions that matter: the Agency field disappears for admins, the
     * payload carries only name/email, and the request goes to the admin
     * endpoint — the municipality is still the server's decision.
     */
    describe('add admin', () => {
        const openForm = async () => {
            render(<AdminUsersPage />);
            // The directory renders a desktop table and a mobile card list, so
            // every user appears twice.
            await screen.findAllByText('Jayker Ramirez');
            fireEvent.click(screen.getByRole('button', { name: 'Add a user account' }));
            await screen.findByRole('heading', { name: 'Add user' });
        };

        const selectAdmin = () => fireEvent.click(screen.getByRole('radio', { name: 'Admin' }));
        const fillForm = () => {
            fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ana Reyes' } });
            fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } });
        };
        const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create and send invitation' }));

        test('dialog renders the account-type selector with Responder preselected', async () => {
            await openForm();

            const group = screen.getByRole('radiogroup', { name: 'Account type' });
            expect(within(group).getByRole('radio', { name: 'Responder' })).toHaveAttribute('aria-checked', 'true');
            expect(within(group).getByRole('radio', { name: 'Admin' })).toHaveAttribute('aria-checked', 'false');
            // Agency is a responder-only field and visible by default.
            expect(screen.getByLabelText('Agency')).toBeInTheDocument();
        });

        test('selecting Admin hides the Agency field and shows the admin helper copy', async () => {
            await openForm();

            selectAdmin();

            expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
            expect(screen.getByText(/the admin sets their own password from a single-use invitation link/)).toBeInTheDocument();
        });

        test('submits name/email only to the admin endpoint', async () => {
            mocks.createAdmin.mockResolvedValue({
                data: { data: { invitationSent: true, message: 'Invitation sent to ana@example.com' } },
            });

            await openForm();
            selectAdmin();
            fillForm();
            submit();

            await waitFor(() => expect(mocks.createAdmin).toHaveBeenCalledTimes(1));
            expect(mocks.createResponder).not.toHaveBeenCalled();

            const payload = mocks.createAdmin.mock.calls[0][0];
            expect(payload).toEqual({ name: 'Ana Reyes', email: 'ana@example.com' });
            expect(payload).not.toHaveProperty('agency');
            expect(payload).not.toHaveProperty('role');
            expect(payload).not.toHaveProperty('assignedMunicipality');
            expect(payload).not.toHaveProperty('password');

            await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Invitation sent to ana@example.com'));
        });

        test('surfaces the server error for a failed admin creation', async () => {
            mocks.createAdmin.mockRejectedValue({
                response: { data: { success: false, message: 'Failed to create the admin account' } },
            });

            await openForm();
            selectAdmin();
            fillForm();
            submit();

            expect(await screen.findByRole('alert')).toHaveTextContent('Failed to create the admin account');
        });
    });

    /**
     * Re-issuing an invitation for an account that already exists.
     *
     * This is the gap that made "it stopped sending to that account" look true:
     * once an account exists, re-adding the same address is refused as a
     * duplicate and never reaches the sender, and the list had no way to send
     * another.
     */
    describe('resend invitation from the list', () => {
        test('offers a resend action on responder rows', async () => {
            render(<AdminUsersPage />);
            await screen.findAllByText('Maria Santos');

            // Desktop row and mobile card both carry it.
            expect(screen.getAllByRole('button', { name: 'Resend invitation to Maria Santos' }).length).toBeGreaterThan(0);
        });

        test('does not offer it on a reporter row', async () => {
            render(<AdminUsersPage />);
            await screen.findAllByText('Jayker Ramirez');

            // The endpoint only issues invitations for responders, so offering it
            // here would be a button that can only fail.
            expect(screen.queryByRole('button', { name: 'Resend invitation to Jayker Ramirez' })).not.toBeInTheDocument();
        });

        test('calls the endpoint for the row it was clicked on', async () => {
            mocks.resendResponderInvitation.mockResolvedValue({
                data: { data: { invitationSent: true, message: 'Invitation sent' } },
            });

            render(<AdminUsersPage />);
            await screen.findAllByText('Maria Santos');

            fireEvent.click(screen.getAllByRole('button', { name: 'Resend invitation to Maria Santos' })[0]);

            await waitFor(() => expect(mocks.resendResponderInvitation).toHaveBeenCalledWith('user-2'));
            expect(mocks.toast.success).toHaveBeenCalledWith('Invitation sent');
        });

        test('surfaces the endpoint’s refusal for an already-activated responder', async () => {
            mocks.resendResponderInvitation.mockRejectedValue({
                response: { data: { message: 'This responder has already set a password' } },
            });

            render(<AdminUsersPage />);
            await screen.findAllByText('Maria Santos');

            fireEvent.click(screen.getAllByRole('button', { name: 'Resend invitation to Maria Santos' })[0]);

            await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('This responder has already set a password'));
        });
    });

    /**
     * Verifier identity on the directory. With several admins per
     * municipality, an approved reporter's row must say who verified them.
     */
    describe('verifier identity', () => {
        const approvedWithVerifier = {
            _id: 'user-3',
            name: 'Pedro Reyes',
            email: 'pedro@example.com',
            role: 'reporter',
            verificationStatus: 'approved',
            address: 'Poblacion, Cajidiocan',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastLogin: '2026-02-01T00:00:00.000Z',
            idDocument: null,
            selfiePhoto: null,
            verifiedBy: { _id: 'admin-1', name: 'Maria Santos' },
        };

        const approvedLegacy = {
            ...approvedWithVerifier,
            _id: 'user-4',
            name: 'Ana Dela Cruz',
            email: 'ana@example.com',
            verifiedBy: null,
        };

        beforeEach(() => {
            mocks.getUsers.mockResolvedValue({
                data: {
                    data: {
                        users: [approvedWithVerifier, approvedLegacy],
                        stats: { totalUsers: 2, reporters: 2, pendingVerification: 0, responders: 0 },
                    },
                },
            });
        });

        test('shows who verified an approved reporter, and nothing for a legacy record', async () => {
            render(<AdminUsersPage />);

            await screen.findAllByText('Pedro Reyes');

            // Desktop table and mobile card both render the line.
            expect(screen.getAllByText('Verified by Maria Santos').length).toBeGreaterThan(0);

            // Legacy record: verifiedBy absent, no verifier line.
            const rows = screen.getAllByText(/Verified by/);
            expect(rows.every((node) => node.textContent === 'Verified by Maria Santos')).toBe(true);
        });
    });
});
