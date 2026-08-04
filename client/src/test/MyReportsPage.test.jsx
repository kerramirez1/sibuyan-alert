import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from '../router';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    callbacks: {},
    getMyReports: vi.fn(),
    addUpdate: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../context/SocketContext', () => ({
    useSocket: () => ({
        subscribe: (event, callback) => {
            mocks.callbacks[event] = callback;
            return vi.fn();
        },
    }),
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        getMyReports: mocks.getMyReports,
        addUpdate: mocks.addUpdate,
    },
}));

vi.mock('react-hot-toast', () => ({ default: mocks.toast }));

vi.mock('../components/ui/ImageViewer', () => ({
    default: () => null,
}));

import MyReportsPage from '../pages/MyReportsPage';

const initialReport = {
    _id: 'report-1',
    address: 'Poblacion coastal road',
    municipalityName: 'Cajidiocan',
    description: 'A motorcycle is blocking one lane.',
    incidentType: 'vehicular',
    incidentTime: '2026-07-17T08:00:00.000Z',
    createdAt: '2026-07-17T08:05:00.000Z',
    updatedAt: '2026-07-17T08:05:00.000Z',
    severity: 'moderate',
    status: 'verified',
    coordinates: { lat: 12.367, lng: 122.684 },
    images: [],
    reportUpdates: [],
    transferHistory: [],
    responders: [],
};

const renderPage = (entry = '/my-reports') => render(
    <MemoryRouter initialEntries={[entry]}>
        <MyReportsPage />
    </MemoryRouter>
);

const expandReport = async () => {
    const location = await screen.findByText(initialReport.address);
    fireEvent.click(location);
    return screen.findByRole('button', { name: 'Send situation update' });
};

describe('reporter situation update flow', () => {
    beforeEach(() => {
        mocks.callbacks = {};
        mocks.getMyReports.mockReset();
        mocks.addUpdate.mockReset();
        mocks.toast.success.mockReset();
        mocks.toast.error.mockReset();
        mocks.getMyReports.mockResolvedValue({ data: { data: [initialReport] } });
    });

    test('opens the requested owned report from a protected map deep link', async () => {
        renderPage('/my-reports?report=report-1');

        expect(await screen.findByRole('button', { name: 'Send situation update' })).toBeInTheDocument();
        expect(screen.getByText('A motorcycle is blocking one lane.')).toBeInTheDocument();
    });

    test('confirms a sensitive update and immediately adds the server result to activity', async () => {
        const latestUpdate = {
            _id: 'update-1',
            tag: 'need_help',
            message: 'The patient needs another medical response unit.',
            createdAt: '2026-07-17T08:12:00.000Z',
        };
        mocks.addUpdate.mockResolvedValue({
            data: {
                data: {
                    report: { ...initialReport, reportUpdates: [latestUpdate] },
                    latestUpdate,
                },
            },
        });

        renderPage();
        fireEvent.click(await expandReport());

        expect(await screen.findByRole('dialog', { name: 'Send situation update' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: /Need urgent help/ }));
        fireEvent.change(screen.getByLabelText('What is happening now?'), {
            target: { value: latestUpdate.message },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send update' }));

        expect(await screen.findByText('Confirm need urgent help')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));

        await waitFor(() => {
            expect(mocks.addUpdate).toHaveBeenCalledWith('report-1', {
                message: latestUpdate.message,
                tag: 'need_help',
            });
        });
        expect(await screen.findByText(latestUpdate.message)).toBeInTheDocument();
        expect(screen.getByText('Sent successfully')).toBeInTheDocument();
        expect(mocks.toast.success).toHaveBeenCalledWith('Situation update sent');
        expect(screen.queryByRole('dialog', { name: 'Send situation update' })).not.toBeInTheDocument();
    });

    test('keeps the draft and shows an inline retryable error when sending fails', async () => {
        mocks.addUpdate.mockRejectedValue({
            response: { data: { message: 'The server is temporarily unavailable' } },
        });

        renderPage();
        fireEvent.click(await expandReport());

        const message = 'Traffic remains blocked in both directions.';
        fireEvent.change(await screen.findByLabelText('What is happening now?'), {
            target: { value: message },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Send update' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('The server is temporarily unavailable');
        expect(screen.getByLabelText('What is happening now?')).toHaveValue(message);
        expect(screen.getByRole('dialog', { name: 'Send situation update' })).toBeInTheDocument();
    });

    test('synchronizes reporter updates received from another signed-in device', async () => {
        renderPage();
        await expandReport();

        const remoteUpdate = {
            _id: 'update-remote',
            tag: 'transported',
            message: 'The patient has arrived at the hospital.',
            createdAt: '2026-07-17T08:20:00.000Z',
        };
        act(() => {
            mocks.callbacks.reportUpdatedByReporter({
                id: 'report-1',
                status: 'verified',
                report: { status: 'verified', reportUpdates: [remoteUpdate] },
            });
        });

        expect(await screen.findByText(remoteUpdate.message)).toBeInTheDocument();
        expect(screen.getByText('Patient transported')).toBeInTheDocument();
    });
});
