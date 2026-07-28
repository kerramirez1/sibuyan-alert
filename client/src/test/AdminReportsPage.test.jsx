import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: null,
    callbacks: {},
    unsubscribers: {},
    getReports: vi.fn(),
    verifyReport: vi.fn(),
    respondToReport: vi.fn(),
    resolveReport: vi.fn(),
    transferReport: vi.fn(),
    acknowledgeTransfer: vi.fn(),
    deleteReport: vi.fn(),
    getMunicipalities: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (event, callback) => {
            mocks.callbacks[event] = callback;
            const unsubscribe = vi.fn();
            mocks.unsubscribers[event] = unsubscribe;
            return unsubscribe;
        },
    }),
}));

vi.mock('../services/api', () => ({
    adminAPI: {
        getReports: mocks.getReports,
        verifyReport: mocks.verifyReport,
        respondToReport: mocks.respondToReport,
        resolveReport: mocks.resolveReport,
        transferReport: mocks.transferReport,
        acknowledgeTransfer: mocks.acknowledgeTransfer,
        deleteReport: mocks.deleteReport,
    },
    reportsAPI: { getMunicipalities: mocks.getMunicipalities },
}));

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="incident-map" />,
}));

vi.mock('../components/ui/ImageViewer', () => ({
    default: ({ isOpen }) => (isOpen ? <div>Evidence viewer</div> : null),
}));

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }) => <>{children}</>,
    motion: {
        div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }) => <div {...props}>{children}</div>,
    },
}));

import AdminReportsPage from '../pages/AdminReportsPage';

const createReport = (overrides = {}) => ({
    _id: 'report-1',
    address: 'Poblacion coastal road',
    description: 'Two vehicles blocking one lane.',
    incidentCategory: 'accident',
    incidentType: 'vehicular',
    incidentTime: '2026-07-17T08:00:00.000Z',
    createdAt: '2026-07-17T08:05:00.000Z',
    severity: 'moderate',
    status: 'pending',
    municipality: 'municipality-1',
    municipalityName: 'Cajidiocan',
    coordinates: { lat: 12.367, lng: 122.684 },
    reporter: { name: 'Field Reporter', isVerified: true },
    responders: [],
    images: [],
    ...overrides,
});

const apiResponse = (reports) => ({
    data: {
        data: {
            reports,
            stats: { pending: 1, verified: 1, responding: 1, resolved: 1 },
        },
    },
});

const renderPage = (entry = '/admin/reports') => render(
    <MemoryRouter initialEntries={[entry]}>
        <AdminReportsPage />
    </MemoryRouter>
);

describe('AdminReportsPage operational queue', () => {
    beforeEach(() => {
        mocks.user = {
            _id: 'admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.callbacks = {};
        mocks.unsubscribers = {};
        Object.values(mocks.toast).forEach((mock) => mock.mockReset());
        [
            mocks.getReports,
            mocks.verifyReport,
            mocks.respondToReport,
            mocks.resolveReport,
            mocks.transferReport,
            mocks.acknowledgeTransfer,
            mocks.deleteReport,
            mocks.getMunicipalities,
        ].forEach((mock) => mock.mockReset());
        mocks.getReports.mockResolvedValue(apiResponse([createReport()]));
        mocks.verifyReport.mockResolvedValue({ data: { data: { status: 'verified' } } });
        mocks.respondToReport.mockResolvedValue({ data: { message: 'Response started', data: { status: 'responding' } } });
        mocks.resolveReport.mockResolvedValue({ data: { message: 'Incident resolved', data: { status: 'resolved' } } });
        mocks.transferReport.mockResolvedValue({ data: { message: 'Incident transferred', data: { status: 'transferred' } } });
        mocks.acknowledgeTransfer.mockResolvedValue({ data: { message: 'Transfer acknowledged', data: { status: 'transferred' } } });
        mocks.deleteReport.mockResolvedValue({ data: { success: true } });
        mocks.getMunicipalities.mockResolvedValue({ data: { data: [] } });
    });

    test('shows administrator review controls without responder-only actions', async () => {
        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getAllByRole('button', { name: 'Verify report' })).not.toHaveLength(0);
        expect(screen.getAllByRole('button', { name: 'Reject report' })).not.toHaveLength(0);
        expect(screen.getAllByRole('button', { name: 'Delete report' })).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: /respond to incident/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /join response/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /resolve incident/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Transferred' })).toBeInTheDocument();
        expect(screen.getByTestId('incident-table')).not.toHaveClass('overflow-x-auto');
        expect(screen.getByTestId('incident-table').querySelector('table')).toHaveClass('table-fixed');
        const compactVerifyButton = screen.getAllByRole('button', { name: 'Verify report' })
            .find((button) => button.hasAttribute('aria-label'));
        expect(compactVerifyButton).toHaveClass('h-10', 'w-10');
        expect(compactVerifyButton.parentElement).toHaveClass('flex', 'flex-wrap', 'justify-center');
        const mobileVerifyButton = screen.getAllByRole('button', { name: 'Verify report' })
            .find((button) => !button.hasAttribute('aria-label'));
        expect(mobileVerifyButton).toHaveClass('w-full', 'min-h-11');
        expect(mobileVerifyButton.parentElement.className).toContain('auto-fit');
    });

    test('closes the incident details drawer from its exit button', async () => {
        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Poblacion coastal road' })).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Close incident details' }).find((button) => button.querySelector('svg')));
        expect(screen.queryByRole('dialog', { name: 'Poblacion coastal road' })).not.toBeInTheDocument();
    });

    test('shows only eligible responder actions and requires assignment to resolve', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            agency: 'PNP',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                status: 'responding',
                respondedBy: { _id: 'responder-1', name: 'Assigned Officer', agency: 'PNP' },
                responders: [{ user: 'responder-1', unitName: 'PNP Patrol 01', unitType: 'PNP' }],
            }),
        ]));

        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getAllByRole('button', { name: 'Join response' })).not.toHaveLength(0);
        expect(screen.getAllByRole('button', { name: 'Resolve incident' })).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Transfer report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete report' })).not.toBeInTheDocument();
    });

    test('applies lifecycle socket updates and unsubscribes on unmount', async () => {
        const transferredReport = createReport({
            _id: 'report-2',
            address: 'Transferred boundary incident',
            status: 'transferred',
            transferHistory: [{
                _id: 'transfer-1',
                fromMunicipalityName: 'Magdiwang',
                toMunicipalityName: 'Cajidiocan',
                transferredAt: '2026-07-17T08:08:00.000Z',
                acknowledgedAt: null,
            }],
        });
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({ status: 'verified' }),
            transferredReport,
        ]));
        const { unmount } = renderPage();
        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getAllByText('Transferred').length).toBeGreaterThan(0);

        act(() => {
            mocks.callbacks.reportResponded({
                id: 'report-1',
                respondedBy: { _id: 'responder-1', name: 'Response Unit', agency: 'PNP' },
                respondedAt: '2026-07-17T08:10:00.000Z',
                responders: [{ user: 'responder-1' }],
            });
        });
        expect(screen.getAllByText('Responding').length).toBeGreaterThan(0);

        act(() => {
            mocks.callbacks.reportResolved({
                id: 'report-1',
                resolvedBy: { _id: 'responder-1', name: 'Response Unit', agency: 'PNP' },
                resolvedAt: '2026-07-17T08:30:00.000Z',
                resolutionNotes: 'Road cleared',
            });
        });
        expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0);

        act(() => {
            mocks.callbacks.reportTransferAcknowledged({
                id: 'report-2',
                transferId: 'transfer-1',
                acknowledgedAt: '2026-07-17T08:15:00.000Z',
                acknowledgedBy: { _id: 'admin-1', name: 'Cajidiocan Admin' },
            });
        });
        expect(screen.getAllByText('Transfer acknowledged').length).toBeGreaterThan(0);

        expect(Object.keys(mocks.callbacks)).toEqual(expect.arrayContaining([
            'reportResponded',
            'reportResolved',
            'reportVerified',
            'reportRejectedUpdate',
            'reportDeleted',
            'reportTransferred',
            'reportTransferAcknowledged',
            'reportUpdatedByReporter',
        ]));

        unmount();
        Object.values(mocks.unsubscribers).forEach((unsubscribe) => {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });

    test('keeps the dispatch queue limited to unassigned verified and transferred incidents', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({ _id: 'verified-open', address: 'Open verified incident', status: 'verified' }),
            createReport({
                _id: 'verified-assigned',
                address: 'Assigned verified incident',
                status: 'verified',
                respondedBy: { _id: 'responder-2', name: 'Other Unit' },
            }),
            createReport({ _id: 'transferred-open', address: 'Transferred open incident', status: 'transferred' }),
            createReport({ _id: 'pending-review', address: 'Pending review incident', status: 'pending' }),
        ]));

        renderPage('/admin/reports?view=dispatch-queue');

        await screen.findAllByText('Open verified incident');
        expect(screen.getAllByText('Transferred open incident')).not.toHaveLength(0);
        expect(screen.queryByText('Assigned verified incident')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending review incident')).not.toBeInTheDocument();
        expect(mocks.getReports).toHaveBeenCalledWith({});
    });

    test('preserves administrator verification confirmation and API transition', async () => {
        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Verify report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Verify incident report' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm verification' }));

        await waitFor(() => expect(mocks.verifyReport).toHaveBeenCalledWith('report-1', {
            status: 'verified',
            rejectionReason: '',
        }));
    });

    test('lets only the current target municipal admin acknowledge the latest transfer', async () => {
        const transferredReport = createReport({
            status: 'transferred',
            transferHistory: [{
                _id: 'transfer-1',
                fromMunicipalityName: 'Magdiwang',
                toMunicipalityName: 'Cajidiocan',
                reason: 'The incident coordinates are inside Cajidiocan.',
                transferredBy: { _id: 'source-admin', name: 'Magdiwang Admin' },
                transferredAt: '2026-07-17T08:08:00.000Z',
                acknowledgedAt: null,
            }],
        });
        const acknowledgedReport = {
            ...transferredReport,
            transferHistory: [{
                ...transferredReport.transferHistory[0],
                acknowledgedAt: '2026-07-17T08:15:00.000Z',
                acknowledgedBy: { _id: 'admin-1', name: 'Cajidiocan Admin' },
            }],
        };
        mocks.getReports
            .mockResolvedValueOnce(apiResponse([transferredReport]))
            .mockResolvedValue(apiResponse([acknowledgedReport]));
        mocks.acknowledgeTransfer.mockResolvedValue({
            data: {
                message: 'Transfer acknowledged successfully',
                data: acknowledgedReport,
            },
        });

        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        expect(screen.getAllByText('Awaiting acknowledgment').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge transfer' })[0]);

        await waitFor(() => expect(mocks.acknowledgeTransfer).toHaveBeenCalledWith('report-1'));
        expect(await screen.findAllByText('Transfer acknowledged')).not.toHaveLength(0);
        expect(mocks.toast.success).toHaveBeenCalledWith('Transfer acknowledged successfully');
    });

    test('does not expose acknowledgment to an administrator outside the target municipality', async () => {
        mocks.user = {
            _id: 'source-admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Magdiwang',
        };
        mocks.getReports.mockResolvedValue(apiResponse([createReport({
            status: 'transferred',
            transferHistory: [{
                _id: 'transfer-1',
                fromMunicipalityName: 'Magdiwang',
                toMunicipalityName: 'Cajidiocan',
                transferredAt: '2026-07-17T08:08:00.000Z',
                acknowledgedAt: null,
            }],
        })]));

        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        expect(screen.queryByRole('button', { name: 'Acknowledge transfer' })).not.toBeInTheDocument();
    });

    test('renders loading, empty, and error states with retry', async () => {
        let resolveRequest;
        mocks.getReports.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
        const firstRender = renderPage();
        expect(screen.getByRole('status')).toHaveTextContent('Loading incident reports');

        await act(async () => {
            resolveRequest(apiResponse([]));
        });
        expect(await screen.findByText('No incident reports found')).toBeInTheDocument();
        firstRender.unmount();

        mocks.getReports.mockRejectedValueOnce({ response: { data: { message: 'Network unavailable' } } });
        renderPage();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Network unavailable');
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('keeps report deletion behind destructive confirmation', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        renderPage();
        await screen.findAllByText('Poblacion coastal road');
        const deleteButton = screen.getAllByRole('button', { name: 'Delete report' })[0];

        fireEvent.click(deleteButton);
        expect(mocks.deleteReport).not.toHaveBeenCalled();
        fireEvent.click(deleteButton);
        await waitFor(() => expect(mocks.deleteReport).toHaveBeenCalledWith('report-1'));
        expect(confirmSpy).toHaveBeenCalledTimes(2);
        confirmSpy.mockRestore();
    });
});
