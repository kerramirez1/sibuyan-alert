import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

const { createReportMock, geocodeLocationMock, searchLocationsMock, mapPropsSpy, toastMock } = vi.hoisted(() => ({
    createReportMock: vi.fn(),
    geocodeLocationMock: vi.fn(),
    searchLocationsMock: vi.fn(),
    mapPropsSpy: vi.fn(),
    toastMock: {
        loading: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('../services/api', () => ({
    reportsAPI: {
        create: createReportMock,
        geocodeLocation: geocodeLocationMock,
        searchLocations: searchLocationsMock,
    },
}));

vi.mock('react-hot-toast', () => ({ default: toastMock }));



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
        expect(mapPropsSpy.mock.lastCall[0].mode).toBe('report-location');
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
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Two motorcycles skidded on loose gravel' } });
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
        expect(payload.get('description')).toBe('Two motorcycles skidded on loose gravel');
        expect(payload.get('fireInvolved')).toBe('false');
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('updates casualties fields and handles non-zero inputs cleanly', () => {
        renderPage();

        const injuredInput = screen.getByLabelText(/^injured$/i);
        const fatalitiesInput = screen.getByLabelText(/^fatalities$/i);
        const missingInput = screen.getByLabelText(/^missing$/i);

        fireEvent.change(injuredInput, { target: { value: '3' } });
        fireEvent.change(fatalitiesInput, { target: { value: '1' } });
        fireEvent.change(missingInput, { target: { value: '0' } });

        expect(injuredInput).toHaveValue(3);
        expect(fatalitiesInput).toHaveValue(1);
        expect(missingInput).toHaveValue(0);
    });

    test('displays location search error when search yields no matches', async () => {
        searchLocationsMock.mockResolvedValueOnce({ data: { data: [] } });
        renderPage();

        const searchInput = screen.getByPlaceholderText(/search landmark or place/i);
        fireEvent.change(searchInput, { target: { value: 'Nonexistent Landmark 123' } });
        fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith(
                'Location not found. Try a different keyword.',
                expect.objectContaining({ id: 'app-notification' })
            );
        });
    });
});
