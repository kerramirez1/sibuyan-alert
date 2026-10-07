import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { uploadEvidenceMock, resolveReportMock, toastMock } = vi.hoisted(() => ({
    uploadEvidenceMock: vi.fn(),
    resolveReportMock: vi.fn(),
    toastMock: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../services/api', () => ({
    adminAPI: { resolveReport: resolveReportMock },
    reportsAPI: { uploadEvidence: uploadEvidenceMock },
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

let latestActions = null;
const Harness = () => {
    const actions = useIncidentActions({
        user: { _id: 'responder-1', role: 'responder' },
        patchReport: patchReportMock,
        removeReport: vi.fn(),
        refreshReports: refreshReportsMock,
        closeDetails: vi.fn(),
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

beforeEach(() => {
    vi.clearAllMocks();
    latestActions = null;
    patchReportMock.mockClear();
    refreshReportsMock.mockClear();
    globalThis.URL.createObjectURL = vi.fn((file) => `blob:mock/${file?.name || 'file'}`);
    globalThis.URL.revokeObjectURL = vi.fn();
    resolveReportMock.mockResolvedValue({ data: { message: 'Incident resolved', data: { _id: 'report-1' } } });
    uploadEvidenceMock.mockResolvedValue({
        data: { data: { _id: 'report-1', images: ['/api/files/1/resolved.jpg'] } },
    });
});

describe('Resolve incident dialog — resolution photos', () => {
    test('uploads photos before resolving, with a stable photoId per photo', async () => {
        openDialog(baseReport());
        await selectPhotos(2);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(2));

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(uploadEvidenceMock).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));

        // Upload-first order: every evidence POST precedes the resolve call.
        const uploadOrders = uploadEvidenceMock.mock.invocationCallOrder;
        const resolveOrder = resolveReportMock.mock.invocationCallOrder[0];
        for (const order of uploadOrders) expect(order).toBeLessThan(resolveOrder);

        // Same shape as the existing evidence flow: one FormData per photo
        // with `images` and a stable `photoId`.
        const [reportId, firstForm] = uploadEvidenceMock.mock.calls[0];
        const [, secondForm] = uploadEvidenceMock.mock.calls[1];
        expect(reportId).toBe('report-1');
        expect(firstForm.getAll('images')).toHaveLength(1);
        expect(firstForm.get('photoId')).toBeTruthy();
        expect(secondForm.get('photoId')).toBeTruthy();
        expect(secondForm.get('photoId')).not.toBe(firstForm.get('photoId'));

        // The updated images array lands in the patch payload so galleries
        // update without a refetch.
        expect(patchReportMock).toHaveBeenCalledWith(
            'report-1',
            expect.objectContaining({ status: 'resolved', images: ['/api/files/1/resolved.jpg'] })
        );
    });

    test('an upload failure stops the resolve, keeps the dialog open, and shows the API error', async () => {
        openDialog(baseReport());
        await selectPhotos(1);
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));

        uploadEvidenceMock.mockRejectedValueOnce({
            response: { data: { code: 'EXCEEDS_IMAGE_LIMIT', message: 'Exceeds maximum limit of 5 evidence photos per report.' } },
        });

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(
            'Exceeds maximum limit of 5 evidence photos per report.'
        ));
        // The resolve call never happens; the dialog stays open with the
        // photos still selected for retry or removal.
        expect(resolveReportMock).not.toHaveBeenCalled();
        expect(screen.getByTestId('resolve-modal')).toBeInTheDocument();
        expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1);
        expect(patchReportMock).not.toHaveBeenCalled();
    });

    test('resolves as today when no photos are selected', async () => {
        openDialog(baseReport());

        fireEvent.click(screen.getByRole('button', { name: /confirm resolved/i }));

        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        expect(uploadEvidenceMock).not.toHaveBeenCalled();
        expect(patchReportMock).toHaveBeenCalledWith(
            'report-1',
            expect.objectContaining({ status: 'resolved', resolutionNotes: '' })
        );
        expect(patchReportMock.mock.calls[0][1]).not.toHaveProperty('images');
        expect(screen.queryByTestId('resolve-modal')).not.toBeInTheDocument();
    });

    test('caps selectable photos at the remaining evidence slots', async () => {
        openDialog(baseReport({ images: ['/api/files/1/a.jpg', '/api/files/1/b.jpg', '/api/files/1/c.jpg', '/api/files/1/d.jpg'] }));

        expect(screen.getByText(/attach up to 1 photo/i)).toBeInTheDocument();
        await selectPhotos(3);
        // Only one slot remains: the extra files are dropped.
        await waitFor(() => expect(screen.getAllByAltText('Resolution photo preview')).toHaveLength(1));
        expect(screen.getByRole('button', { name: /add photos/i })).toBeDisabled();
    });

    test('disables the picker with an explanatory note when no slots remain', async () => {
        openDialog(baseReport({ images: ['a', 'b', 'c', 'd', 'e'] }));

        expect(screen.getByText(/maximum of 5 evidence photos/i)).toBeInTheDocument();
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

        // Reopening starts clean — no stale photos carried over.
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
        await waitFor(() => expect(uploadEvidenceMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
    });
});
