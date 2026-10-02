import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    user: null,
    callbacks: {},
    unsubscribers: {},
    getReports: vi.fn(),
    getReportById: vi.fn(),
    verifyReport: vi.fn(),
    respondToReport: vi.fn(),
    resolveReport: vi.fn(),
    transferReport: vi.fn(),
    acknowledgeTransfer: vi.fn(),
    deleteReport: vi.fn(),
    dismissReport: vi.fn(),
    getMunicipalities: vi.fn(),
    markNotificationAsRead: vi.fn(),
    recordViewEvent: vi.fn(() => Promise.resolve({ data: { data: { counted: true } } })),
    setUnreadCount: vi.fn(),
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
        setUnreadCount: mocks.setUnreadCount,
    }),
}));

vi.mock('../services/api', () => ({
    adminAPI: {
        getReports: mocks.getReports,
        getReportById: mocks.getReportById,
        verifyReport: mocks.verifyReport,
        respondToReport: mocks.respondToReport,
        resolveReport: mocks.resolveReport,
        transferReport: mocks.transferReport,
        acknowledgeTransfer: mocks.acknowledgeTransfer,
        deleteReport: mocks.deleteReport,
        dismissReport: mocks.dismissReport,
    },
    reportsAPI: { getMunicipalities: mocks.getMunicipalities },
    notificationsAPI: { markAsRead: mocks.markNotificationAsRead },
    // The incident drawer records a reach view on mount. Vitest throws when a
    // mock omits a named export the code imports, so this has to be declared —
    // which is the point: the mock has to match the shape the code imports.
    viewsAPI: { recordViewEvent: mocks.recordViewEvent },
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
import { clearQueryCache } from '../utils/queryCache';

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

const apiResponse = (reports, pagination = null) => ({
    data: {
        data: {
            reports,
            stats: { pending: 1, verified: 1, responding: 1, resolved: 1 },
            ...(pagination ? { pagination } : {}),
        },
    },
});

const LocationProbe = () => {
    const location = useLocation();
    return <span data-testid="current-location" aria-hidden="true">{location.pathname}{location.search}</span>;
};

const renderPage = (entry = '/admin/reports') => render(
    <MemoryRouter initialEntries={[entry]}>
        <AdminReportsPage />
        <LocationProbe />
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
            mocks.getReportById,
            mocks.verifyReport,
            mocks.respondToReport,
            mocks.resolveReport,
            mocks.transferReport,
            mocks.acknowledgeTransfer,
            mocks.deleteReport,
            mocks.dismissReport,
            mocks.getMunicipalities,
            mocks.markNotificationAsRead,
            mocks.setUnreadCount,
        ].forEach((mock) => mock.mockReset());
        mocks.getReports.mockResolvedValue(apiResponse([createReport()]));
        mocks.getReportById.mockImplementation((id) => Promise.resolve({
            data: {
                data: {
                    ...createReport({ _id: id }),
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                },
            },
        }));
        mocks.verifyReport.mockResolvedValue({ data: { data: { status: 'verified' } } });
        mocks.respondToReport.mockResolvedValue({ data: { message: 'Response started', data: { status: 'responding' } } });
        mocks.resolveReport.mockResolvedValue({ data: { message: 'Incident resolved', data: { status: 'resolved' } } });
        mocks.transferReport.mockResolvedValue({ data: { message: 'Incident transferred', data: { status: 'transferred' } } });
        mocks.acknowledgeTransfer.mockResolvedValue({ data: { message: 'Transfer acknowledged', data: { status: 'transferred' } } });
        mocks.deleteReport.mockResolvedValue({ data: { success: true } });
        mocks.dismissReport.mockResolvedValue({ data: { success: true, message: 'Report removed from your queue' } });
        mocks.getMunicipalities.mockResolvedValue({ data: { data: [] } });
        mocks.markNotificationAsRead.mockResolvedValue({ data: { data: { unreadCount: 2 } } });
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
    });

    test('opens the exact scoped incident from an update notification before marking it read', async () => {
        const reportId = '64b100000000000000000001';
        const updateId = '64b100000000000000000002';
        const notificationId = '64b100000000000000000003';
        const updateMessage = 'The patient needs another medical response unit.';
        mocks.getReports.mockResolvedValue(apiResponse([createReport({
            _id: reportId,
            status: 'verified',
            reportUpdates: [{
                _id: updateId,
                tag: 'need_help',
                message: updateMessage,
                createdAt: '2026-07-17T08:20:00.000Z',
                author: { name: 'Field Reporter' },
            }],
        })]));
        mocks.getReportById.mockResolvedValue({
            data: {
                data: createReport({
                    _id: reportId,
                    status: 'verified',
                    reportUpdates: [{
                        _id: updateId,
                        tag: 'need_help',
                        message: updateMessage,
                        createdAt: '2026-07-17T08:20:00.000Z',
                        author: { name: 'Field Reporter' },
                    }],
                    transferHistory: [],
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                }),
            },
        });

        renderPage(`/admin/reports?report=${reportId}&source=notification&notification=${notificationId}&update=${updateId}`);

        expect(await screen.findByRole('dialog', { name: 'Poblacion coastal road' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Urgent help requested' })).toBeInTheDocument();
        expect(screen.getAllByText(updateMessage).length).toBeGreaterThan(0);
        expect(mocks.getReports).toHaveBeenCalledWith({ reportId });
        await waitFor(() => expect(mocks.markNotificationAsRead).toHaveBeenCalledWith(notificationId));
        expect(mocks.setUnreadCount).toHaveBeenCalledWith(2);
        expect(screen.queryByRole('button', { name: /respond to incident/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /resolve incident/i })).not.toBeInTheDocument();
    });

    test('highlights a real-time reporter update in the queue and incident drawer', async () => {
        mocks.getReports.mockResolvedValue(apiResponse([createReport({ status: 'verified', reportUpdates: [] })]));
        renderPage();
        await screen.findAllByText('Poblacion coastal road');
        const liveUpdate = {
            _id: '64b100000000000000000005',
            tag: 'transported',
            message: 'The patient has been transported to the medical team.',
            createdAt: '2026-07-17T08:25:00.000Z',
            author: { name: 'Field Reporter' },
        };

        act(() => {
            mocks.callbacks.reportUpdatedByReporter({
                id: 'report-1',
                status: 'verified',
                update: liveUpdate,
                report: { status: 'verified', reportUpdates: [liveUpdate] },
            });
        });

        expect(screen.getAllByText(/New reporter update/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        expect(screen.getByRole('heading', { name: 'Patient transported' })).toBeInTheDocument();
        expect(screen.getAllByText(liveUpdate.message).length).toBeGreaterThan(0);
    });

    test('closes the incident details drawer from its exit button', async () => {
        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Poblacion coastal road' })).toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: 'Close incident details' }).find((button) => button.querySelector('svg')));
        expect(screen.queryByRole('dialog', { name: 'Poblacion coastal road' })).not.toBeInTheDocument();
    });

    test('shows resolve instead of join for an assigned responder using API-normalized IDs', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            agency: 'PNP',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                status: 'responding',
                respondedBy: { id: 'responder-1', name: 'Assigned Officer', agency: 'PNP' },
                responders: [{ user: { id: 'responder-1', name: 'Assigned Officer' }, unitName: 'PNP Patrol 01', unitType: 'PNP' }],
            }),
        ]));

        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.queryByRole('button', { name: 'Join response' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Resolve incident' })).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Transfer report' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete report' })).not.toBeInTheDocument();
    });

    test('gives the responder row the same primary weight whichever action applies', async () => {
        // Reported from a screenshot: on the responder queue the buttons looked
        // flat next to the admin row's filled "Inspect report". The cause was that
        // "Join response" was filled while "Resolve incident" was a plain outline —
        // so an ASSIGNED responder saw two outlines and nothing primary, while an
        // unassigned one saw a primary. Same class of action, two weights.
        //
        // The join half is asserted in 'offers join without resolve when another
        // responder owns the active incident' above; this is the resolve half.
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            agency: 'PNP',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                status: 'responding',
                respondedBy: { id: 'responder-1', name: 'Assigned Officer', agency: 'PNP' },
                responders: [{ user: { id: 'responder-1', name: 'Assigned Officer' }, unitName: 'PNP Patrol 01', unitType: 'PNP' }],
            }),
        ]));

        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getAllByRole('button', { name: 'Resolve incident' })[0]).toHaveClass('bg-brand-700');
    });

    test('offers join without resolve when another responder owns the active incident', async () => {
        mocks.user = {
            id: 'responder-2',
            role: 'responder',
            agency: 'MDRRMO',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                status: 'responding',
                respondedBy: { id: 'responder-1', name: 'Assigned Officer', agency: 'PNP' },
                responders: [{ user: { id: 'responder-1', name: 'Assigned Officer' }, unitName: 'PNP Patrol 01', unitType: 'PNP' }],
            }),
        ]));

        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getAllByRole('button', { name: 'Join response' })[0]).toHaveClass('bg-brand-700');
        expect(screen.queryByRole('button', { name: 'Resolve incident' })).not.toBeInTheDocument();
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
        expect(screen.getAllByText('Active response').length).toBeGreaterThan(0);

        act(() => {
            mocks.callbacks.reportResolved({
                id: 'report-1',
                resolvedBy: { agency: 'PNP' },
                resolvedAt: '2026-07-17T08:30:00.000Z',
            });
            mocks.callbacks.reportResolutionDetails({
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
            'reportResolutionDetails',
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

    test('requests the server-filtered available responder queue', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({ _id: 'verified-open', address: 'Open verified incident', status: 'verified' }),
            createReport({ _id: 'transferred-open', address: 'Transferred open incident', status: 'transferred' }),
        ]));

        renderPage('/admin/reports?view=dispatch-queue');

        await screen.findAllByText('Open verified incident');
        expect(screen.getAllByText('Transferred open incident')).not.toHaveLength(0);
        expect(mocks.getReports).toHaveBeenCalledWith({ page: 1, limit: 20, responderView: 'available' });
    });

    test('renders a future incident time as absolute with a quiet flag, not "in X hours"', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                _id: '64b100000000000000000013',
                address: 'Future-dated incident',
                status: 'verified',
                incidentTime: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            }),
        ]));

        renderPage('/admin/reports?view=dispatch-queue');

        const flag = await screen.findByText('check time');
        expect(flag).toBeInTheDocument();
        const timeElement = flag.closest('time');
        expect(timeElement).toHaveAttribute('title');
        // The absolute timestamp must not read as a relative future ("in ...").
        expect(timeElement.textContent).not.toMatch(/\bin about\b|\bin \d+/);
    });

    test('shows the active view count — not the municipal stats total — in a filtered responder queue', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        // Stats total is nonzero (verified + responding + resolved) while the
        // dispatch queue itself is empty — the headline must match the list.
        mocks.getReports.mockResolvedValue(apiResponse([]));

        renderPage('/admin/reports?view=dispatch-queue');

        expect(await screen.findByText('No incidents are waiting for dispatch')).toBeInTheDocument();
        expect(screen.getByLabelText('Operational totals')).toHaveTextContent('0 incidents');
        // Municipal-global sub-counts must not leak into a filtered view —
        // they count transferred-out incidents the queue itself excludes.
        expect(screen.queryByText(/1 responding/)).not.toBeInTheDocument();
        expect(screen.queryByText(/1 resolved/)).not.toBeInTheDocument();
    });

    test('shows transfer provenance and lets the origin admin remove a transferred-out copy', async () => {
        mocks.user = {
            _id: 'admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        // Post-dismiss refresh returns an empty queue.
        mocks.getReports.mockResolvedValueOnce(apiResponse([
            createReport({
                _id: 'transferred-out-1',
                address: 'E. Quirino Street, Poblacion',
                status: 'responding',
                municipalityName: 'San Fernando',
                originalMunicipalityName: 'Cajidiocan',
                transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'San Fernando' }],
            }),
        ]));
        mocks.getReports.mockResolvedValue(apiResponse([]));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderPage();

        expect(await screen.findByText('E. Quirino Street, Poblacion')).toBeInTheDocument();
        expect(screen.getByText('Transferred to San Fernando')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete report' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Remove transferred report from queue' }));

        await waitFor(() => expect(mocks.dismissReport).toHaveBeenCalledWith('transferred-out-1'));
        await waitFor(() => expect(screen.queryByText('E. Quirino Street, Poblacion')).not.toBeInTheDocument());
        confirmSpy.mockRestore();
    });

    test('renders responder incidents as one severity-first operational list', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            agency: 'MDRRMO',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                _id: 'active-critical',
                address: 'Near Cambijang bridge',
                severity: 'critical',
                status: 'responding',
                respondedBy: { id: 'responder-1', name: 'Rescue Lead', agency: 'MDRRMO' },
                responders: [{ user: { id: 'responder-1', name: 'Rescue Lead' }, unitName: 'MDRRMO Rescue 1', unitType: 'MDRRMO' }],
            }),
            createReport({
                _id: 'resolved-moderate',
                address: 'Cajidiocan public market',
                severity: 'moderate',
                status: 'resolved',
                respondedBy: { id: 'responder-1', name: 'Rescue Lead', agency: 'MDRRMO' },
            }),
        ]));

        renderPage();

        const list = await screen.findByRole('list', { name: 'Responder incident list' });
        expect(list).toHaveClass('surface-panel', 'divide-y');
        expect(screen.queryByTestId('incident-table')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Incident reports' })).toBeInTheDocument();
        expect(screen.getByLabelText('Operational totals')).toHaveTextContent('3 incidents');
        expect(screen.getByText('critical')).toHaveClass('text-red-700');
        expect(screen.getByText('MDRRMO Rescue 1')).toBeInTheDocument();

        const activeRow = screen.getByText('Near Cambijang bridge').closest('li');
        const resolvedRow = screen.getByText('Cajidiocan public market').closest('li');
        const respondingStatus = within(activeRow).getByText('Active response');
        const resolvedStatus = within(resolvedRow).getByText('Resolved');
        expect(respondingStatus).toHaveClass('text-[var(--text-secondary)]');
        expect(respondingStatus).not.toHaveClass('bg-cyan-50', 'text-cyan-700');
        expect(resolvedStatus).toHaveClass('text-[var(--text-secondary)]');
        expect(resolvedStatus).not.toHaveClass('bg-green-50', 'text-green-700');
        // CHANGED DELIBERATELY. This asserted `border-gray-300 bg-white text-gray-700`
        // — the old outlined treatment, which was the inconsistency itself:
        // "Join response" was filled while "Resolve incident" was a plain outline,
        // so an assigned responder's row had no primary at all next to the admin
        // row's filled "Inspect report". Both now share one treatment; see
        // 'gives the responder row the same primary weight whichever action applies'.
        expect(within(activeRow).getByRole('button', { name: 'Resolve incident' })).toHaveClass('bg-brand-700');
        // CHANGED: this asserted `btn-outline` on the old wide labelled button.
        // Inspect is now one compact icon-only control shared by both roles, so
        // what matters is that it stays reachable by name with no text in it.
        const inspectButton = within(activeRow).getByRole('button', { name: 'Inspect report' });
        expect(inspectButton).toHaveAttribute('title', 'Inspect report');
        expect(inspectButton.textContent).toBe('');
        expect(within(resolvedRow).getByRole('button', { name: 'Inspect report' })).toBeInTheDocument();
        expect(within(resolvedRow).queryByRole('button', { name: 'Resolve incident' })).not.toBeInTheDocument();
    });

    test('opens responder details as a compact non-modal inspector and marks the source row', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            agency: 'MDRRMO',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                _id: 'active-critical',
                address: 'Near Cambijang bridge',
                barangay: 'Cambijang',
                severity: 'critical',
                status: 'responding',
                detailCompleteness: 'full',
                respondedBy: { id: 'responder-1', name: 'Rescue Lead', agency: 'MDRRMO' },
                responders: [{ user: { id: 'responder-1' }, unitName: 'MDRRMO Rescue 1', unitType: 'MDRRMO' }],
            }),
        ]));

        renderPage();

        const sourceRow = (await screen.findByText('Near Cambijang bridge')).closest('article');
        fireEvent.click(within(sourceRow).getByRole('button', { name: 'Inspect report' }));

        const inspector = screen.getByTestId('responder-incident-inspector');
        expect(inspector).toHaveAttribute('role', 'dialog');
        expect(inspector).toHaveAttribute('aria-modal', 'false');
        expect(inspector).toHaveClass('md:w-[30rem]', 'md:max-w-[calc(100vw-2rem)]');
        expect(inspector).toHaveClass('min-h-0', 'overflow-hidden');
        expect(inspector).not.toHaveClass('max-w-2xl');
        expect(inspector.parentElement).toBe(document.body);
        const panelBody = within(inspector).getByTestId('incident-panel-scroll-body');
        expect(panelBody.parentElement).toBe(inspector);
        expect(panelBody).toHaveClass('min-h-0', 'flex-1', 'overflow-x-hidden', 'overflow-y-auto');
        expect(panelBody.scrollTop).toBe(0);
        expect(sourceRow).toHaveAttribute('data-selected', 'true');
        expect(sourceRow).toHaveClass('bg-[var(--accent-soft)]', 'border-l-[var(--accent)]');
        expect(within(sourceRow).getByRole('button', { name: 'Inspect report' })).toHaveAttribute('aria-expanded', 'true');
        expect(within(sourceRow).getByRole('button', { name: 'Inspect report' })).toHaveAttribute('aria-controls', 'responder-incident-inspector');
        const openFullMap = within(inspector).getByRole('button', { name: 'Open full map' });
        expect(openFullMap).toBeInTheDocument();
        expect(within(inspector).queryByTestId('incident-map')).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('');

        fireEvent.click(openFullMap);
        await waitFor(() => expect(screen.getByTestId('current-location')).toHaveTextContent(
            '/dashboard?view=map&report=active-critical',
        ));
        expect(screen.getByTestId('current-location')).not.toHaveTextContent('lat=');
        expect(screen.getByTestId('current-location')).not.toHaveTextContent('duration=');
    });

    test('resets the panel body scroll when switching incidents and restores focus after Escape', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            agency: 'MDRRMO',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({
                _id: 'first-report',
                address: 'Cambijang bridge approach',
                status: 'verified',
                detailCompleteness: 'full',
            }),
            createReport({
                _id: 'second-report',
                address: 'Poblacion coastal junction',
                status: 'verified',
                detailCompleteness: 'full',
            }),
            createReport({
                _id: 'third-report',
                address: 'Lumbang Este roadside',
                status: 'verified',
                detailCompleteness: 'full',
            }),
        ]));

        renderPage();

        const firstRow = (await screen.findByText('Cambijang bridge approach')).closest('article');
        const secondRow = screen.getByText('Poblacion coastal junction').closest('article');
        const thirdRow = screen.getByText('Lumbang Este roadside').closest('article');
        fireEvent.click(within(firstRow).getByRole('button', { name: 'Inspect report' }));
        expect(await screen.findByRole('dialog', { name: 'Cambijang bridge approach' })).toBeInTheDocument();
        const panelBody = screen.getByTestId('incident-panel-scroll-body');
        panelBody.scrollTop = 360;

        const secondInspectButton = within(secondRow).getByRole('button', { name: 'Inspect report' });
        secondInspectButton.focus();
        fireEvent.click(secondInspectButton);

        expect(await screen.findByRole('dialog', { name: 'Poblacion coastal junction' })).toBeInTheDocument();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.getByTestId('incident-panel-scroll-body')).toBe(panelBody);
        expect(panelBody.scrollTop).toBe(0);
        expect(firstRow).toHaveAttribute('data-selected', 'false');
        expect(secondRow).toHaveAttribute('data-selected', 'true');

        panelBody.scrollTop = 240;
        const thirdInspectButton = within(thirdRow).getByRole('button', { name: 'Inspect report' });
        thirdInspectButton.focus();
        fireEvent.click(thirdInspectButton);

        expect(await screen.findByRole('dialog', { name: 'Lumbang Este roadside' })).toBeInTheDocument();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(panelBody.scrollTop).toBe(0);
        expect(secondRow).toHaveAttribute('data-selected', 'false');
        expect(thirdRow).toHaveAttribute('data-selected', 'true');

        fireEvent.keyDown(window, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('responder-incident-inspector')).not.toBeInTheDocument());
        expect(thirdInspectButton).toHaveFocus();

        fireEvent.click(within(firstRow).getByRole('button', { name: 'Inspect report' }));
        expect(await screen.findByRole('dialog', { name: 'Cambijang bridge approach' })).toBeInTheDocument();
        expect(screen.getByTestId('incident-panel-scroll-body').scrollTop).toBe(0);
    });

    test('keeps responder status, search, clear, and refresh behavior server-backed', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([createReport({ status: 'responding' })]));

        renderPage();
        await screen.findByRole('list', { name: 'Responder incident list' });
        expect(screen.getByText(/Last updated/)).toBeInTheDocument();
        // One lifecycle state, one name: these filter buttons read the same
        // canonical labels as the map rail, the cards, and the badges.
        ['All statuses', 'Pending', 'Verified', 'Transferred', 'Active response', 'Resolved'].forEach((label) => {
            expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: 'Rejected' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Active response' }));
        expect(screen.getByRole('button', { name: 'Active response' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Active response' })).not.toHaveClass('bg-cyan-50', 'text-cyan-700');
        await waitFor(() => expect(mocks.getReports).toHaveBeenLastCalledWith({ page: 1, limit: 20, status: 'responding' }));

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search incidents' }), {
            target: { value: 'Cambijang' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await waitFor(() => expect(mocks.getReports).toHaveBeenLastCalledWith({
            page: 1,
            limit: 20,
            status: 'responding',
            search: 'Cambijang',
        }));

        const callsBeforeRefresh = mocks.getReports.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await waitFor(() => expect(mocks.getReports).toHaveBeenCalledTimes(callsBeforeRefresh + 1));

        // Clearing back to a recently visited filter serves the fresh SWR cache
        // instantly; drop it here so the test can assert the reset query params.
        clearQueryCache();
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        await waitFor(() => expect(mocks.getReports).toHaveBeenLastCalledWith({ page: 1, limit: 20 }));
    });

    test('ignores a stale rejected status query that responders are not authorized to filter', async () => {
        mocks.user = {
            id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({ status: 'responding' }),
            createReport({ _id: 'resolved-report', status: 'resolved' }),
        ]));

        renderPage('/admin/reports?status=rejected');

        const incidentList = await screen.findByRole('list', { name: 'Responder incident list' });
        expect(mocks.getReports).toHaveBeenCalledWith({ page: 1, limit: 20 });
        expect(screen.getByRole('button', { name: 'All statuses' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('button', { name: 'Rejected' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
        expect(within(incidentList).getByText('Active response')).toBeInTheDocument();
        expect(within(incidentList).getByText('Resolved')).toBeInTheDocument();
    });

    test('switches between responder work queues through URL-backed server views', async () => {
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([]));

        renderPage('/admin/reports?view=dispatch-queue');
        expect(await screen.findByRole('heading', { name: 'Incident reports' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Available' })).toHaveAttribute('aria-current', 'page');
        fireEvent.click(screen.getByRole('button', { name: 'Municipal active' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Municipal active' })).toHaveAttribute('aria-current', 'page'));
        await waitFor(() => expect(mocks.getReports).toHaveBeenCalledWith({
            page: 1,
            limit: 20,
            responderView: 'municipalActive',
        }));

        fireEvent.click(screen.getByRole('button', { name: 'My active' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'My active' })).toHaveAttribute('aria-current', 'page'));
        await waitFor(() => expect(mocks.getReports).toHaveBeenCalledWith({
            page: 1,
            limit: 20,
            responderView: 'active',
        }));
    });

    test('moves a newly accepted incident into My active and keeps its details open', async () => {
        const reportId = '64b100000000000000000011';
        mocks.user = {
            _id: 'responder-1',
            role: 'responder',
            agency: 'PNP',
            assignedMunicipality: 'Cajidiocan',
        };
        const availableReport = createReport({ _id: reportId, status: 'verified' });
        const activeReport = createReport({
            _id: reportId,
            status: 'responding',
            respondedBy: { _id: 'responder-1', name: 'Response Unit', agency: 'PNP' },
            responders: [{ user: 'responder-1', unitName: 'PNP - Cajidiocan', unitType: 'PNP' }],
        });
        mocks.getReports
            .mockResolvedValueOnce(apiResponse([availableReport]))
            .mockResolvedValue(apiResponse([activeReport]));
        mocks.respondToReport.mockResolvedValue({
            data: { message: 'Response started', data: activeReport },
        });

        renderPage('/admin/reports?view=dispatch-queue');
        await screen.findAllByText('Poblacion coastal road');
        fireEvent.click(screen.getAllByRole('button', { name: 'Respond to incident' })[0]);

        await waitFor(() => expect(mocks.getReports).toHaveBeenCalledWith({ reportId }));
        expect(await screen.findByRole('button', { name: 'My active' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('dialog', { name: 'Poblacion coastal road' })).toBeInTheDocument();
    });

    test('renders responsive pagination and requests the selected page', async () => {
        mocks.getReports.mockResolvedValue(apiResponse(
            [createReport()],
            { page: 1, limit: 20, total: 25, pages: 2 },
        ));

        renderPage();
        await screen.findAllByText('Poblacion coastal road');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        await waitFor(() => expect(mocks.getReports).toHaveBeenCalledWith({ page: 2, limit: 20 }));
    });

    test('confirms verification without casualty editing', async () => {
        mocks.user = {
            _id: 'admin-1',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([
            createReport({ casualties: { injured: 1, fatalities: 0, missing: 2 } }),
        ]));

        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Verify report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Verify incident report' })).toBeInTheDocument();

        // No casualty inputs in the verify confirmation anymore.
        expect(screen.queryByLabelText('Injured')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Fatalities')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Missing')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Confirm verification' }));

        await waitFor(() => expect(mocks.verifyReport).toHaveBeenCalledWith('report-1', {
            status: 'verified',
            rejectionReason: '',
        }));
    });

    test('preserves administrator verification confirmation and API transition', async () => {
        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Verify report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Verify incident report' })).toBeInTheDocument();
        expect(screen.getByText(/This will make the incident eligible for responder action/i)).toBeInTheDocument();

        // Escape cancels confirmation without closing inspector
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Verify incident report' })).not.toBeInTheDocument();
        expect(screen.getByTestId('responder-incident-inspector')).toBeInTheDocument();

        // Re-open and confirm
        fireEvent.click(screen.getAllByRole('button', { name: 'Verify report' })[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm verification' }));

        await waitFor(() => expect(mocks.verifyReport).toHaveBeenCalledWith('report-1', {
            status: 'verified',
            rejectionReason: '',
        }));
    });

    test('handles administrator rejection confirmation with required reason', async () => {
        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Reject report' })[0]);
        expect(screen.getByRole('dialog', { name: 'Reject incident report' })).toBeInTheDocument();

        const confirmBtn = screen.getByRole('button', { name: 'Confirm rejection' });
        expect(confirmBtn).toBeDisabled();

        const reasonInput = screen.getByPlaceholderText(/Reason for rejection \(required\)\.\.\./i);
        fireEvent.change(reasonInput, { target: { value: 'Duplicate report of already resolved event' } });
        expect(confirmBtn).toBeEnabled();

        fireEvent.click(confirmBtn);
        await waitFor(() => expect(mocks.verifyReport).toHaveBeenCalledWith('report-1', {
            status: 'rejected',
            rejectionReason: 'Duplicate report of already resolved event',
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
        expect(mocks.toast.success).toHaveBeenCalledWith(
            'Transfer acknowledged successfully',
            expect.objectContaining({ id: 'app-notification', duration: 2500 }),
        );
    });

    test('reads the transfer and its acknowledgement as a single line', async () => {
        const transferredReport = createReport({
            _id: 'report-1',
            address: 'Poblacion coastal road',
            status: 'transferred',
            transferHistory: [{
                _id: 'transfer-1',
                fromMunicipalityName: 'Magdiwang',
                toMunicipalityName: 'Cajidiocan',
                transferredAt: '2026-07-17T08:08:00.000Z',
                acknowledgedAt: null,
            }],
        });
        mocks.user = {
            _id: 'admin-1',
            name: 'Cajidiocan Municipal Admin',
            role: 'municipal_admin',
            assignedMunicipality: 'Cajidiocan',
        };
        mocks.getReports.mockResolvedValue(apiResponse([transferredReport]));

        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        // Both halves of the same fact — where it came from, and whether this
        // office has taken it up — sit in one row. Rendering either outside this
        // box (or inside a column) puts them back on two lines, which is what the
        // queue used to spend on every transferred incident.
        const summary = document.querySelector('[data-transfer-summary="true"]');
        expect(summary).not.toBeNull();
        expect(summary).toHaveTextContent('Awaiting acknowledgment');
        expect(summary).toHaveTextContent('Transferred from Magdiwang');
        expect(summary.className).toContain('flex-wrap');
        expect(summary.className).not.toContain('flex-col');
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

        // Cold load with a failing network must surface the error state.
        // (With a warm SWR cache the stale queue stays on screen instead.)
        clearQueryCache();
        mocks.getReports.mockRejectedValueOnce({ response: { data: { message: 'Network unavailable' } } });
        renderPage();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Network unavailable');
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('updates inspector and queue immediately upon successful verification and reveals transfer action', async () => {
        const pendingReport = createReport({
            _id: 'report-1',
            status: 'pending',
            severity: 'moderate',
            address: 'Poblacion coastal road',
        });
        let reportsData = {
            reports: [pendingReport],
            stats: { pending: 4, verified: 1, responding: 1, resolved: 1 },
            pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        };
        mocks.getReports.mockImplementation(() => Promise.resolve({
            data: { data: reportsData },
        }));

        mocks.verifyReport.mockImplementationOnce(async () => {
            reportsData = {
                reports: [{ ...pendingReport, status: 'verified' }],
                stats: { pending: 3, verified: 2, responding: 1, resolved: 1 },
                pagination: { page: 1, limit: 20, total: 1, pages: 1 },
            };
            return {
                data: {
                    success: true,
                    message: 'Incident verified successfully.',
                    data: {
                        ...pendingReport,
                        status: 'verified',
                        verifiedBy: 'admin-1',
                        verifiedAt: '2026-07-17T08:12:00.000Z',
                    },
                },
            };
        });

        renderPage();

        await screen.findAllByText('Poblacion coastal road');
        expect(screen.getByText('4 pending review')).toBeInTheDocument();

        // 1. Open inspector
        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        const inspector = await screen.findByRole('dialog', { name: 'Poblacion coastal road' });
        expect(inspector).toBeInTheDocument();
        expect(within(inspector).getByText('Pending')).toBeInTheDocument();
        expect(within(inspector).getByRole('button', { name: 'Verify report' })).toBeInTheDocument();
        expect(within(inspector).getByRole('button', { name: 'Reject report' })).toBeInTheDocument();
        expect(within(inspector).queryByRole('button', { name: 'Transfer report' })).not.toBeInTheDocument();

        // 2. Click Verify Report
        fireEvent.click(within(inspector).getByRole('button', { name: 'Verify report' }));
        expect(screen.getByRole('heading', { name: 'Verify incident report?' })).toBeInTheDocument();

        // 3. Confirm verification
        fireEvent.click(screen.getByRole('button', { name: 'Confirm verification' }));

        await waitFor(() => {
            expect(mocks.verifyReport).toHaveBeenCalledWith('report-1', {
                status: 'verified',
                rejectionReason: '',
            });
        });

        // 4. Verify inspector updates immediately
        await waitFor(() => {
            const currentInspector = screen.getByRole('dialog', { name: 'Poblacion coastal road' });
            expect(screen.queryByRole('heading', { name: 'Verify incident report?' })).not.toBeInTheDocument();
            expect(within(currentInspector).getAllByText('Verified').length).toBeGreaterThanOrEqual(1);
            expect(within(currentInspector).queryByText('Pending')).not.toBeInTheDocument();
        });

        // 5. Actions update: Verify/Reject gone, Transfer appears
        const activeInspector = screen.getByRole('dialog', { name: 'Poblacion coastal road' });
        expect(within(activeInspector).queryByRole('button', { name: 'Verify report' })).not.toBeInTheDocument();
        expect(within(activeInspector).queryByRole('button', { name: 'Reject report' })).not.toBeInTheDocument();
        expect(within(activeInspector).getByRole('button', { name: 'Transfer report' })).toBeInTheDocument();

        // 6. Inspector remains open and stats update
        expect(activeInspector).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText('3 pending review')).toBeInTheDocument();
        });
    });

    test('handles failed verification safely without falsely updating inspector or queue status', async () => {
        const pendingReport = createReport({
            _id: 'report-1',
            status: 'pending',
            address: 'Poblacion coastal road',
        });
        mocks.getReports.mockResolvedValue(apiResponse([pendingReport]));
        mocks.verifyReport.mockRejectedValueOnce({
            response: {
                data: {
                    message: 'Server error verifying report',
                },
            },
        });

        renderPage();
        await screen.findAllByText('Poblacion coastal road');

        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        const inspector = await screen.findByRole('dialog', { name: 'Poblacion coastal road' });

        fireEvent.click(within(inspector).getByRole('button', { name: 'Verify report' }));
        expect(screen.getByRole('heading', { name: 'Verify incident report?' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Confirm verification' }));

        await waitFor(() => {
            expect(mocks.toast.error).toHaveBeenCalledWith(
                expect.stringContaining('Server error verifying report'),
                expect.anything(),
            );
        });

        // Status remains Pending, confirmation remains available
        expect(within(inspector).getByText('Pending')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Verify incident report?' })).toBeInTheDocument();
        expect(within(inspector).queryByRole('button', { name: 'Transfer report' })).not.toBeInTheDocument();
    });

    test('opens inline transfer form inside inspector, validates fields, and transfers successfully', async () => {
        const verifiedReport = createReport({
            _id: 'report-1',
            status: 'verified',
            address: 'M. Aquino Street, Poblacion',
            municipality: '64b000000000000000000001',
            municipalityName: 'Cajidiocan',
        });
        let currentReportsPayload = {
            reports: [verifiedReport],
            stats: { pending: 1, verified: 1, responding: 1, resolved: 1 },
            pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        };
        mocks.getReports.mockImplementation(() => Promise.resolve({ data: { data: currentReportsPayload } }));
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...verifiedReport,
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                },
            },
        });
        mocks.getMunicipalities.mockResolvedValue({
            data: {
                data: [
                    { _id: '64b000000000000000000001', name: 'Cajidiocan' },
                    { _id: '64b000000000000000000002', name: 'Magdiwang' },
                    { _id: '64b000000000000000000003', name: 'San Fernando' },
                ],
            },
        });
        mocks.transferReport.mockImplementation(() => {
            currentReportsPayload = {
                reports: [{ ...verifiedReport, status: 'transferred', municipality: '64b000000000000000000002', municipalityName: 'Magdiwang' }],
                stats: { pending: 1, verified: 0, responding: 1, resolved: 1 },
                pagination: { page: 1, limit: 20, total: 1, pages: 1 },
            };
            return Promise.resolve({
                data: {
                    message: 'Report transferred successfully',
                    data: {
                        _id: 'report-1',
                        status: 'transferred',
                        municipality: '64b000000000000000000002',
                        municipalityName: 'Magdiwang',
                    },
                },
            });
        });

        renderPage();
        await screen.findAllByText('M. Aquino Street, Poblacion');

        // 1. Open inspector
        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        const inspector = await screen.findByRole('dialog', { name: 'M. Aquino Street, Poblacion' });
        expect(inspector).toBeInTheDocument();

        // 2. Click Transfer report
        const transferButton = within(inspector).getByRole('button', { name: 'Transfer report' });
        fireEvent.click(transferButton);

        // 3. Inline transfer panel appears inside inspector (NOT as a separate full modal)
        expect(screen.getByRole('heading', { name: 'Transfer incident' })).toBeInTheDocument();
        expect(screen.getByText(/Incident context:/i)).toHaveTextContent('M. Aquino Street, Poblacion');
        expect(screen.getByLabelText(/Target municipality/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Explain the jurisdiction or mutual-aid reason/i)).toBeInTheDocument();

        // Confirm button is disabled initially
        const confirmBtn = screen.getByRole('button', { name: 'Confirm transfer' });
        expect(confirmBtn).toBeDisabled();

        // 4. Test cancel behavior: returns to details view without closing inspector
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('heading', { name: 'Transfer incident' })).not.toBeInTheDocument();
        expect(within(inspector).getByRole('button', { name: 'Transfer report' })).toBeInTheDocument();

        // 5. Re-open and fill form
        fireEvent.click(within(inspector).getByRole('button', { name: 'Transfer report' }));
        await waitFor(() => {
            expect(screen.getByRole('option', { name: 'Magdiwang' })).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText(/Target municipality/i), {
            target: { value: '64b000000000000000000002' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Explain the jurisdiction or mutual-aid reason/i), {
            target: { value: 'Incident occurred near Magdiwang boundary line' },
        });

        expect(screen.getByRole('button', { name: 'Confirm transfer' })).not.toBeDisabled();

        // 6. Submit transfer
        fireEvent.click(screen.getByRole('button', { name: 'Confirm transfer' }));

        await waitFor(() => {
            expect(mocks.transferReport).toHaveBeenCalledWith('report-1', {
                targetMunicipalityId: '64b000000000000000000002',
                reason: 'Incident occurred near Magdiwang boundary line',
            });
        });

        // 7. Status updates immediately in inspector and transfer panel closes
        await waitFor(() => {
            expect(screen.queryByRole('heading', { name: 'Transfer incident' })).not.toBeInTheDocument();
            const currentInspector = screen.getByRole('dialog', { name: 'M. Aquino Street, Poblacion' });
            expect(within(currentInspector).getAllByText('Transferred').length).toBeGreaterThanOrEqual(1);
        });

        expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining('Report transferred successfully'), expect.anything());
    });

    test('handles failed transfer safely without falsely updating inspector status', async () => {
        const verifiedReport = createReport({
            _id: 'report-1',
            status: 'verified',
            address: 'M. Aquino Street, Poblacion',
            municipality: '64b000000000000000000001',
            municipalityName: 'Cajidiocan',
        });
        mocks.getReports.mockResolvedValue(apiResponse([verifiedReport]));
        mocks.getReportById.mockResolvedValue({
            data: {
                data: {
                    ...verifiedReport,
                    detailAccess: 'operational',
                    detailCompleteness: 'full',
                    reportUpdates: [],
                    transferHistory: [],
                },
            },
        });
        mocks.getMunicipalities.mockResolvedValue({
            data: {
                data: [
                    { _id: '64b000000000000000000001', name: 'Cajidiocan' },
                    { _id: '64b000000000000000000002', name: 'Magdiwang' },
                ],
            },
        });
        mocks.transferReport.mockRejectedValueOnce({
            response: {
                data: {
                    message: 'Transfer failed: jurisdiction conflict',
                },
            },
        });

        renderPage();
        await screen.findAllByText('M. Aquino Street, Poblacion');

        fireEvent.click(screen.getAllByRole('button', { name: 'Inspect report' })[0]);
        const inspector = await screen.findByRole('dialog', { name: 'M. Aquino Street, Poblacion' });

        fireEvent.click(within(inspector).getByRole('button', { name: 'Transfer report' }));
        await waitFor(() => {
            expect(screen.getByRole('option', { name: 'Magdiwang' })).toBeInTheDocument();
        });

        fireEvent.change(screen.getByLabelText(/Target municipality/i), {
            target: { value: '64b000000000000000000002' },
        });
        fireEvent.change(screen.getByPlaceholderText(/Explain the jurisdiction or mutual-aid reason/i), {
            target: { value: 'Boundary issue requires transfer' },
        });

        fireEvent.click(screen.getByRole('button', { name: 'Confirm transfer' }));

        await waitFor(() => {
            expect(mocks.toast.error).toHaveBeenCalledWith(
                expect.stringContaining('Transfer failed: jurisdiction conflict'),
                expect.anything(),
            );
        });

        // Form remains open with preserved values, status remains Verified
        expect(screen.getByRole('heading', { name: 'Transfer incident' })).toBeInTheDocument();
        expect(screen.getByLabelText(/Target municipality/i)).toHaveValue('64b000000000000000000002');
        expect(within(inspector).getAllByText('Verified').length).toBeGreaterThanOrEqual(1);
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
