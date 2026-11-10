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
        user: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
        patchReport: patchReportMock,
        removeReport: vi.fn(),
        refreshReports: refreshReportsMock,
        closeDetails: vi.fn(),
    });
    latestActions = actions;
    return <IncidentActionDialogs actions={actions} municipality="Cajidiocan" />;
};

const respondingReport = () => ({
    _id: 'report-1',
    status: 'responding',
    municipalityName: 'Cajidiocan',
    address: 'Poblacion, Cajidiocan',
    description: 'Reported pileup on the circumferential road',
    casualties: { injured: 0, fatalities: 0, missing: 0 },
    respondedBy: { _id: 'responder-1' },
    responders: [{ user: { _id: 'responder-1' }, unitName: 'MDRRMO Alpha', unitType: 'rescue' }],
    images: [],
    resolutionImages: [],
});

const openDialog = () => {
    render(<Harness />);
    act(() => {
        latestActions.openResolve(respondingReport());
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    latestActions = null;
    globalThis.URL.createObjectURL = vi.fn((file) => `blob:mock/${file?.name || 'file'}`);
    globalThis.URL.revokeObjectURL = vi.fn();
    resolveReportMock.mockResolvedValue({
        data: { message: 'Report resolved successfully by MDRRMO', data: { _id: 'report-1', resolutionImages: [] } },
    });
});

describe('Resolve dialog — false information option', () => {
    test('checking the box shows the helper text and makes the notes required', () => {
        openDialog();

        const checkbox = screen.getByRole('checkbox', { name: /This report was false information/i });
        expect(screen.getByText('The report will still be recorded as resolved, but it will not be counted in analytics.')).toBeInTheDocument();
        const notesLabel = (text) => screen.getByText(
            (content, element) => element.tagName === 'SPAN' && element.textContent === text,
        );
        expect(notesLabel('Resolution notes (optional)')).toBeInTheDocument();

        fireEvent.click(checkbox);

        expect(notesLabel('Resolution notes (required)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Confirm resolved/i })).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('Describe the response outcome'), {
            target: { value: 'No incident at the address.' },
        });
        expect(screen.getByRole('button', { name: /Confirm resolved/i })).toBeEnabled();
    });

    test('a flagged submit puts isFalseInformation=true and the notes in the form data', async () => {
        openDialog();

        fireEvent.click(screen.getByRole('checkbox', { name: /This report was false information/i }));
        fireEvent.change(screen.getByPlaceholderText('Describe the response outcome'), {
            target: { value: 'Caller admitted it was a prank.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Confirm resolved/i }));

        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        const [reportId, payload] = resolveReportMock.mock.calls[0];
        expect(reportId).toBe('report-1');
        expect(payload).toBeInstanceOf(FormData);
        expect(payload.get('isFalseInformation')).toBe('true');
        expect(payload.get('resolutionNotes')).toBe('Caller admitted it was a prank.');
        // The local patch carries the flag so the drawer badge and the
        // analytics exclusion apply without a refetch.
        expect(patchReportMock).toHaveBeenCalledWith('report-1', expect.objectContaining({
            status: 'resolved',
            isFalseInformation: true,
        }));
    });

    test('an unflagged submit keeps the plain notes payload exactly as before', async () => {
        openDialog();

        fireEvent.change(screen.getByPlaceholderText('Describe the response outcome'), {
            target: { value: 'Debris cleared.' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Confirm resolved/i }));

        await waitFor(() => expect(resolveReportMock).toHaveBeenCalledTimes(1));
        const [, payload] = resolveReportMock.mock.calls[0];
        expect(payload).toEqual({ resolutionNotes: 'Debris cleared.' });
        expect(patchReportMock).toHaveBeenCalledWith('report-1', expect.objectContaining({
            isFalseInformation: false,
        }));
    });

    test('the submit is blocked client-side when the box is checked and notes are blank', async () => {
        openDialog();

        fireEvent.click(screen.getByRole('checkbox', { name: /This report was false information/i }));
        // Bypass the disabled button: call the action the button would call.
        await act(async () => {
            await latestActions.confirmResolve();
        });

        expect(resolveReportMock).not.toHaveBeenCalled();
        expect(toastMock.error).toHaveBeenCalledWith(
            expect.stringContaining('Resolution notes are required'),
        );
    });
});
