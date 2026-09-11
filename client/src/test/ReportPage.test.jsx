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
    reportsAPI: {
        create: createReportMock,
        geocodeLocation: geocodeLocationMock,
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
        globalThis.URL.createObjectURL = vi.fn((file) => `blob:mock/${file?.name || 'file'}`);
        globalThis.URL.revokeObjectURL = vi.fn();
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
            expect.objectContaining({ id: 'app-notification', duration: 2500 })
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
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('omits blank casualty fields from the payload instead of sending zeros', async () => {
        // A reporter who does not know the casualty count leaves the fields
        // blank. Sending 0 would misrepresent "not recorded" as "none".
        renderPage();

        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Near Municipal Hall' } });
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Casualty count unknown at the scene' } });
        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
        const payload = createReportMock.mock.calls[0][0];
        expect(payload.get('casualties[injured]')).toBeNull();
        expect(payload.get('casualties[fatalities]')).toBeNull();
        expect(payload.get('casualties[missing]')).toBeNull();
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

    describe('Evidence Photos & Camera Capture MVP', () => {
        test('renders Take photo and Choose photos actions and hidden capture inputs', () => {
            renderPage();

            const takePhotoButton = screen.getByRole('button', { name: /take photo/i });
            const choosePhotosButton = screen.getByRole('button', { name: /choose photos/i });
            const cameraInput = screen.getByLabelText(/take evidence photo/i);
            const uploadInput = screen.getByLabelText(/upload evidence photos/i);

            expect(takePhotoButton).toBeInTheDocument();
            expect(choosePhotosButton).toBeInTheDocument();
            expect(cameraInput).toHaveAttribute('type', 'file');
            expect(cameraInput).toHaveAttribute('accept', 'image/*');
            expect(cameraInput).toHaveAttribute('capture', 'environment');
            expect(uploadInput).toHaveAttribute('type', 'file');
            expect(uploadInput).toHaveAttribute('accept', 'image/*');
            expect(uploadInput).toHaveAttribute('multiple');
            expect(screen.getByText(/attached photos \(0\/5\)/i)).toBeInTheDocument();
        });

        test('handles photo capture and renders preview with updated count', async () => {
            renderPage();

            const cameraInput = screen.getByLabelText(/take evidence photo/i);
            const testFile = new File(['evidence-image-bytes'], 'accident-scene.jpg', { type: 'image/jpeg' });

            fireEvent.change(cameraInput, { target: { files: [testFile] } });

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(1\/5\)/i)).toBeInTheDocument();
                expect(screen.getByAltText(/evidence preview 1/i)).toBeInTheDocument();
            });

            // Action buttons update labels to reflect additional photos
            expect(screen.getByRole('button', { name: /take another/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /choose more/i })).toBeInTheDocument();
        });

        test('removes captured photo when clicking remove button', async () => {
            renderPage();

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const file1 = new File(['image1'], 'evidence1.jpg', { type: 'image/jpeg' });
            const file2 = new File(['image2'], 'evidence2.jpg', { type: 'image/jpeg' });

            fireEvent.change(uploadInput, { target: { files: [file1, file2] } });

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(2\/5\)/i)).toBeInTheDocument();
            });

            const removeButtons = await screen.findAllByRole('button', { name: /remove photo 1/i });
            fireEvent.click(removeButtons[0]);

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(1\/5\)/i)).toBeInTheDocument();
            });
        });

        test('validates file format, rejecting non-image files', () => {
            renderPage();

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const invalidFile = new File(['text-content'], 'notes.txt', { type: 'text/plain' });

            fireEvent.change(uploadInput, { target: { files: [invalidFile] } });

            expect(toastMock.error).toHaveBeenCalledWith(
                'notes.txt is not an image',
                expect.objectContaining({ id: 'app-notification' })
            );
            expect(screen.getByText(/attached photos \(0\/5\)/i)).toBeInTheDocument();
        });

        test('validates file size, rejecting files over 5 MB', () => {
            renderPage();

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const bigFile = new File(['large-content'], 'huge-photo.jpg', { type: 'image/jpeg' });
            Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });

            fireEvent.change(uploadInput, { target: { files: [bigFile] } });

            expect(toastMock.error).toHaveBeenCalledWith(
                'huge-photo.jpg is too large (max 5MB)',
                expect.objectContaining({ id: 'app-notification' })
            );
            expect(screen.getByText(/attached photos \(0\/5\)/i)).toBeInTheDocument();
        });

        test('enforces maximum 5 photos limit and displays limit banner when full', async () => {
            renderPage();

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const files = Array.from({ length: 5 }, (_, i) =>
                new File([`image-${i}`], `photo-${i}.jpg`, { type: 'image/jpeg' })
            );

            fireEvent.change(uploadInput, { target: { files } });

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(5\/5\)/i)).toBeInTheDocument();
                expect(screen.getByText(/maximum 5 photos reached/i)).toBeInTheDocument();
                expect(screen.getByText(/maximum 5 evidence photos attached/i)).toBeInTheDocument();
            });

            // Action buttons hidden when max reached
            expect(screen.queryByRole('button', { name: /^(take photo|take another)$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^(choose photos|choose more)$/i })).not.toBeInTheDocument();
        });

        test('submits report with evidence photos in multipart FormData', async () => {
            renderPage();

            fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Barangay Road' } });
            fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });

            const cameraInput = screen.getByLabelText(/take evidence photo/i);
            const photo = new File(['captured-image'], 'camera-evidence.jpg', { type: 'image/jpeg' });
            fireEvent.change(cameraInput, { target: { files: [photo] } });

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(1\/5\)/i)).toBeInTheDocument();
            });

            fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

            await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
            const payload = createReportMock.mock.calls[0][0];
            expect(payload.getAll('images')).toHaveLength(1);
            expect(payload.getAll('images')[0].name).toBe('camera-evidence.jpg');
        });
    });
});
