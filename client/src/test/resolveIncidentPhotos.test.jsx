import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { resolveReportMock, toastMock } = vi.hoisted(() => ({
    resolveReportMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../services/api', () => ({
    adminAPI: { resolveReport: resolveReportMock },
    reportsAPI: {},
}));

vi.mock('../utils/appToast', () => ({ default: toastMock }));

vi.mock('../components/adminReports/incidentReportConfig', () => ({
    getIncidentCapabilities: () => ({ canResolve: true }),
}));

vi.mock('../components/ui/Modal', () => ({
    default: ({ isOpen, children }) => (isOpen ? <div data-testid="resolve-modal">{children}</div> : null),
}));

vi.mock('../components/ResponderUnitModal', () => ({ default: () => null }));

import useIncidentActions from '../hooks/useIncidentActions';
import IncidentActionDialogs from '../components/adminReports/IncidentActionDialogs';

const patchReportMock = vi.fn();
const refreshReportsMock = vi.fn();
const onIncidentResolvedMock = vi.fn();

let latestActions = null;
const Harness = ({ onIncidentResolved }) => {
    const actions = useIncidentActions({
        user: { _id: 'responder-1', role: 'responder' },
        patchReport: patchReportMock,
        removeReport: vi.fn(),
        refreshReports: refreshReportsMock,
        closeDetails: vi.fn(),
        onIncidentResolved,
    });
    latestActions = actions;
    return <IncidentActionDialogs actions={actions} municipality="Cajidiocan" />;
};

const baseReport = (overrides = {}) => ({
    _id: 'report-1',
    address: 'Sibuyan Circumferential Road',
    description: 'Cleared debris',
    status: 'responding',
    images: [],
    resolutionImages: [],
    ...overrides,
});

const openDialog = (report) => {
    render(<Harness />);
    act(() => {
        latestActions.openResolve(report);
    });
};

const selectPhotos = async (count, prefix = 'resolved') => {
    const input = screen.getByLabelText('Add resolution photos');
    const files = Array.from({ length: count }, (_, index) => (
        new File([`${prefix}-${index}`], `${prefix}-${index}.jpg`, { type: 'image/jpeg' })
    ));
    fireEvent.change(input, { target: { files } });
};

const resolvedResponse = (resolutionImages) => ({
    data: {
        message: 'Report resolved successfully by MDRRMO',
        data: { _id: 'report-1', resolutionImages },
    },
});

beforeEach(() => {
    vi.clearAllMocks();
    latestActions = null;
    patchReportMock.mockClear();
    refreshReportsMock.mockClear();
    onIncidentResolvedMock.mockClear();
    globalThis.URL.createObjectURL = vi.fn((file) => `blob:mock/${file?.name || 'file'}`);
    globalThis.URL.revokeObjectURL = vi.fn();
    resolveReportMock.mockResolvedValue(resolvedResponse([]));
});

describe('Resolve incident dialog — resolution photos (separate identity)', () => {
    test('sends one multipart PUT with notes, photos, and stable photoIds', async () => {
        openDialog(baseReport());
        await selectPhotos(2);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(2));

        resolveReportMock.mockResolvedValue(resolvedResponse(['/api/files/1/r1.jpg', '/api/files/1/r2.jpg']));

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        const [reportId, payload] = resolveReportMock.mock.calls[0];
        expect(reportId).toBe('report-1');
        expect(payload).toBeInstanceOf(FormData);
        expect(payload.get('resolutionNotes')).toBe('');
        expect(payload.getAll('resolutionPhotos')).toHaveLength(2);
        const photoIds = payload.getAll('photoIds');
        expect(photoIds).toHaveLength(2);
        expect(photoIds[0]).toBeTruthy();
        expect(photoIds[1]).not.toBe(photoIds[0]);

        // The returned resolutionImages land in the patch payload — never in
        // the reporter's images[].
        expect(patchReportMock).toHaveBeenCalledWith(
            'report-1',
            expect.objectContaining({
                status: 'resolved',
                resolutionImages: ['/api/files/1/r1.jpg', '/api/files/1/r2.jpg'],
            })
        );
        expect(patchReportMock.mock.calls[0][1]).not.toHaveProperty('images');
        expect(screen.queryByTestId('resolve-modal')).not.toBeInTheDocument();
    });

    test('resolves with a plain JSON body when no photos are selected', async () => {
        openDialog(baseReport());

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        const [, payload] = resolveReportMock.mock.calls[0];
        // Plain JSON body — no multipart when there is nothing to upload.
        expect(payload).not.toBeInstanceOf(FormData);
        expect(payload).toEqual({ resolutionNotes: '' });
        expect(patchReportMock).toHaveBeenCalledWith(
            'report-1',
            expect.objectContaining({ status: 'resolved', resolutionNotes: '', resolutionImages: [] })
        );
    });

    test('a failed resolve keeps the dialog open with photos still selected', async () => {
        openDialog(baseReport());
        await selectPhotos(1);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));

        resolveReportMock.mockRejectedValueOnce({
            response: { data: { message: 'Cannot resolve a report with status "resolved".' } },
        });

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(
            'Cannot resolve a report with status "resolved".'
        ));
        expect(patchReportMock).not.toHaveBeenCalled();
        expect(screen.getByTestId('resolve-modal')).toBeInTheDocument();
        expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1);
    });

    test('caps selectable photos at the field maximum (5 - existing resolution images)', async () => {
        openDialog(baseReport({ resolutionImages: ['/api/files/1/r1.jpg', '/api/files/1/r2.jpg', '/api/files/1/r3.jpg', '/api/files/1/r4.jpg'] }));

        expect(screen.getByText(/attach up to 1 photo/i)).toBeInTheDocument();
        await selectPhotos(3);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));
        expect(screen.getByRole('button', { name: /add photos/i })).toBeDisabled();
    });

    test('disables the picker with an explanatory note when no slots remain', async () => {
        openDialog(baseReport({ resolutionImages: ['a', 'b', 'c', 'd', 'e'] }));

        expect(screen.getByText(/maximum of 5 resolution photos/i)).toBeInTheDocument();
        expect(screen.queryByLabelText('Add resolution photos')).not.toBeInTheDocument();
    });

    test('closing the dialog clears the photo selection', async () => {
        const report = baseReport();
        render(<Harness />);
        act(() => {
            latestActions.openResolve(report);
        });
        await selectPhotos(1);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));

        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
        expect(screen.queryByTestId('resolve-modal')).not.toBeInTheDocument();

        act(() => {
            latestActions.openResolve(report);
        });
        await waitFor(() => expect(screen.getByTestId('resolve-modal')).toBeInTheDocument());
        expect(screen.queryByAltText('Resolution photo preview')).not.toBeInTheDocument();
    });

    test('a photo can be removed before confirming', async () => {
        openDialog(baseReport());
        await selectPhotos(2);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(2));

        fireEvent.click(screen.getAllByRole('button', { name: /remove resolution photo/i })[0]);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));
        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        const [, payload] = resolveReportMock.mock.calls[0];
        expect(payload.getAll('resolutionPhotos')).toHaveLength(1);
        expect(payload.getAll('photoIds')).toHaveLength(1);
    });
});
