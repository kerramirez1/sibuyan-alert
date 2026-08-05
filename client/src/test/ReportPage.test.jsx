import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

const { createReportMock, geocodeLocationMock, mapPropsSpy, toastMock } = vi.hoisted(() => ({
    createReportMock: vi.fn(),
    geocodeLocationMock: vi.fn(),
    mapPropsSpy: vi.fn(),
    toastMock: {
        loading: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('../services/api', () => ({
    reportsAPI: { create: createReportMock, geocodeLocation: geocodeLocationMock },
}));

vi.mock('react-hot-toast', () => ({ default: toastMock }));

vi.mock('../hooks/useGlobalHighRiskZones', () => ({
    default: () => ({
        zones: [
            { _id: 'zone-cajidiocan', municipality: 'Cajidiocan' },
            { _id: 'zone-magdiwang', municipality: 'Magdiwang' },
        ],
    }),
}));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapPropsSpy(props);
        return (
            <button type="button" data-testid="location-map" onClick={() => props.onLocationSelect({ lat: 12.39261, lng: 122.67985 })}>
                Pin test location
            </button>
        );
    },
}));

import ReportPage from '../pages/ReportPage';

const renderPage = () => render(
    <MemoryRouter initialEntries={['/report']}>
        <Routes>
            <Route path="/report" element={<ReportPage />} />
            <Route path="/my-reports" element={<div>My reports destination</div>} />
        </Routes>
    </MemoryRouter>
);

describe('ReportPage workflow', () => {
    let geolocation;
    let watchPositionSuccess;

    beforeEach(() => {
        createReportMock.mockReset();
        createReportMock.mockResolvedValue({ data: { success: true } });
        geocodeLocationMock.mockReset();
        geocodeLocationMock.mockResolvedValue({
            data: {
                data: {
                    address: 'Sibuyan Circumferential Road, Taguilos, Cajidiocan',
                    displayAddress: 'Sibuyan Circumferential Road, Taguilos',
                    barangay: { name: 'Taguilos', psgcCode: '1705903014' },
                    barangayAssignment: 'matched',
                },
            },
        });
        Object.values(toastMock).forEach((mock) => mock.mockClear());
        mapPropsSpy.mockClear();
        geolocation = {
            watchPosition: vi.fn((success) => {
                watchPositionSuccess = success;
                return 7;
            }),
            clearWatch: vi.fn(),
        };
        Object.defineProperty(window.navigator, 'geolocation', {
            configurable: true,
            value: geolocation,
        });
    });

    test('uses one submission form and starts only one location watcher', () => {
        const { container } = renderPage();

        expect(container.querySelectorAll('form')).toHaveLength(1);
        expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('location-map')).toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0].highRiskZones.map((zone) => zone.municipality)).toEqual([
            'Cajidiocan',
            'Magdiwang',
        ]);
    });

    test('shows accessible feedback when required fields are missing', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        expect(screen.getByRole('alert')).toHaveTextContent(/complete the required location and incident-time fields/i);
        expect(screen.getByText('Accident time is required')).toBeInTheDocument();
        expect(createReportMock).not.toHaveBeenCalled();
    });

    test('replaces a prior barangay only with the current pin boundary result', async () => {
        renderPage();

        const barangayInput = screen.getByLabelText(/^barangay$/i);
        fireEvent.change(barangayInput, { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByTestId('location-map'));

        await waitFor(() => expect(barangayInput).toHaveValue('Taguilos'));
        expect(geocodeLocationMock).toHaveBeenCalledWith(
            { lat: 12.39261, lng: 122.67985 },
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    test('automatically resolves address and barangay after acquiring a precise GPS location', async () => {
        renderPage();

        act(() => {
            watchPositionSuccess({
                coords: {
                    latitude: 12.39261,
                    longitude: 122.67985,
                    accuracy: 18,
                },
            });
        });

        await waitFor(() => {
            expect(screen.getByLabelText(/address or landmark/i)).toHaveValue('Sibuyan Circumferential Road, Taguilos');
            expect(screen.getByLabelText(/^barangay$/i)).toHaveValue('Taguilos');
        });
        expect(geocodeLocationMock).toHaveBeenCalledWith(
            { lat: 12.39261, lng: 122.67985 },
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(screen.getByRole('button', { name: /confirm location/i })).toBeInTheDocument();
    });

    test('clears a prior barangay when the current pin has no verified boundary', async () => {
        geocodeLocationMock.mockResolvedValueOnce({
            data: { data: { address: 'Sibuyan Circumferential Road, Cajidiocan', barangay: null, barangayAssignment: 'unmatched' } },
        });
        renderPage();

        const barangayInput = screen.getByLabelText(/^barangay$/i);
        fireEvent.change(barangayInput, { target: { value: 'Gutivan' } });
        fireEvent.click(screen.getByTestId('location-map'));

        await waitFor(() => expect(barangayInput).toHaveValue(''));
        expect(toastMock.error).toHaveBeenCalledWith(
            expect.stringMatching(/barangay could not be verified/i),
            expect.objectContaining({ id: 'app-notification', duration: 3000 })
        );
    });

    test('preserves the multipart report contract and redirects after submission', async () => {
        renderPage();

        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Near Municipal Hall' } });
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.change(screen.getByLabelText(/^injured$/i), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
        const payload = createReportMock.mock.calls[0][0];
        expect(payload).toBeInstanceOf(FormData);
        expect(payload.get('incidentCategory')).toBe('accident');
        expect(payload.get('incidentType')).toBe('vehicular');
        expect(payload.get('address')).toBe('Near Municipal Hall');
        expect(payload.get('incidentTime')).toBe('2025-01-15T10:30');
        expect(payload.get('casualties[injured]')).toBe('2');
        expect(payload.get('severity')).toBe('moderate');
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });
});
