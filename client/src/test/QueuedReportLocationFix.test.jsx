import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { updateQueuedReportLocationMock, toastMock } = vi.hoisted(() => ({
    updateQueuedReportLocationMock: vi.fn(async () => true),
    toastMock: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../utils/offlineReportQueue', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, updateQueuedReportLocation: updateQueuedReportLocationMock };
});

vi.mock('../utils/appToast', () => ({ default: toastMock }));

// The real map is heavy and irrelevant here: the dialog only needs the pin it
// hands back through onLocationSelect.
vi.mock('../components/map/MapView', () => ({
    default: ({ onLocationSelect }) => (
        <button type="button" onClick={() => onLocationSelect({ lat: 12.35, lng: 122.15 })}>
            Place test pin
        </button>
    ),
}));

import QueuedReportLocationFix from '../components/reporterReports/QueuedReportLocationFix';

const blockedReport = {
    clientReportId: 'rep-gps',
    label: 'Cajidiocan Port',
    blockedReason: 'GPS accuracy must be 100 meters or better. Please retry GPS or pin the incident on the map.',
    coordinates: { lat: 12.3, lng: 122.1 },
};

const setGeolocation = (implementation) => {
    Object.defineProperty(window.navigator, 'geolocation', {
        configurable: true,
        value: implementation,
    });
};

const geolocationSuccess = (latitude, longitude, accuracy) => ({
    getCurrentPosition: (success) => success({
        coords: { latitude, longitude, accuracy },
    }),
});

const geolocationFailure = (code) => ({
    getCurrentPosition: (_success, failure) => failure({ code }),
});

const renderDialog = (overrides = {}) => {
    const onClose = vi.fn();
    render(
        <QueuedReportLocationFix
            isOpen
            blockedReport={blockedReport}
            isOnline
            onClose={onClose}
            {...overrides}
        />,
    );
    return { onClose };
};

describe('QueuedReportLocationFix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateQueuedReportLocationMock.mockResolvedValue(true);
    });

    afterEach(() => {
        delete window.navigator.geolocation;
    });

    test('saves a fresh GPS fix and resends the report', async () => {
        setGeolocation(geolocationSuccess(12.35, 122.15, 25));
        const { onClose } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));
        expect(await screen.findByText(/Precise GPS position \(25m\)/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Save and resend/i }));

        await waitFor(() => expect(updateQueuedReportLocationMock).toHaveBeenCalledWith('rep-gps', {
            lat: 12.35,
            lng: 122.15,
            locationSource: 'gps',
            locationAccuracy: 25,
        }));
        expect(toastMock.success).toHaveBeenCalledWith('Location updated. Resending the report.');
        expect(onClose).toHaveBeenCalled();
    });

    test('refuses an inaccurate GPS fix and points at the map instead', async () => {
        setGeolocation(geolocationSuccess(12.35, 122.15, 150));
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));

        // A fix the server would refuse is not offered for saving: accepting
        // it would queue the same rejection the reporter is fixing.
        expect(await screen.findByRole('alert')).toHaveTextContent(/too low \(150m\)/i);
        expect(screen.queryByRole('button', { name: /Save and resend/i })).not.toBeInTheDocument();
        expect(updateQueuedReportLocationMock).not.toHaveBeenCalled();
    });

    test('explains a denied permission without touching the queue', async () => {
        setGeolocation(geolocationFailure(1));
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/i);
        expect(updateQueuedReportLocationMock).not.toHaveBeenCalled();
    });

    test('falls back to a manual pin when geolocation is unavailable', async () => {
        const { onClose } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/not supported/i);

        fireEvent.click(screen.getByRole('button', { name: /Choose on map/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Place test pin/i }));
        fireEvent.click(screen.getByRole('button', { name: /Save pin and resend/i }));

        await waitFor(() => expect(updateQueuedReportLocationMock).toHaveBeenCalledTimes(1));
        const [clientReportId, correction] = updateQueuedReportLocationMock.mock.calls[0];
        expect(clientReportId).toBe('rep-gps');
        expect(correction).toMatchObject({ lat: 12.35, lng: 122.15, locationSource: 'map_pin' });
        // A hand-placed pin must not carry the refused GPS meters forward.
        expect(correction).not.toHaveProperty('locationAccuracy');
        expect(onClose).toHaveBeenCalled();
    });

    test('says the right thing when the correction is saved offline', async () => {
        setGeolocation(geolocationSuccess(12.35, 122.15, 25));
        const { onClose } = renderDialog({ isOnline: false });

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Save and resend/i }));

        await waitFor(() => expect(updateQueuedReportLocationMock).toHaveBeenCalled());
        expect(toastMock.success).toHaveBeenCalledWith('Location saved. It will be sent when you are back online.');
        expect(onClose).toHaveBeenCalled();
    });

    test('reports a queue entry that vanished instead of inventing one', async () => {
        setGeolocation(geolocationSuccess(12.35, 122.15, 25));
        updateQueuedReportLocationMock.mockResolvedValue(false);
        const { onClose } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /Capture GPS position/i }));
        fireEvent.click(await screen.findByRole('button', { name: /Save and resend/i }));

        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(
            'That queued report is no longer on this device.',
        ));
        expect(onClose).toHaveBeenCalled();
    });

    test('cancelling leaves the queued report exactly as it was', () => {
        setGeolocation(geolocationSuccess(12.35, 122.15, 25));
        const { onClose } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

        expect(updateQueuedReportLocationMock).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });
});
