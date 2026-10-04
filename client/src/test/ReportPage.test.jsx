import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

const { createReportMock, uploadEvidenceMock, geocodeLocationMock, mapPropsSpy, toastMock } = vi.hoisted(() => ({
    createReportMock: vi.fn(),
    uploadEvidenceMock: vi.fn(),
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
        uploadEvidence: uploadEvidenceMock,
        geocodeLocation: geocodeLocationMock,
    },
}));

vi.mock('react-hot-toast', () => ({ default: toastMock }));

// The page stamps each stored copy with the filing reporter, so the queue can
// only ever be delivered by that reporter's own session.
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: { _id: 'reporter-1', role: 'reporter', isVerified: true } }),
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
import { resetToastDedupeForTests } from '../utils/appToast';
import { resetUploadThroughputForTesting } from '../utils/evidenceImage';

const renderPage = () => render(
    <MemoryRouter initialEntries={['/report']}>
        <Routes>
            <Route path="/report" element={<ReportPage />} />
            <Route path="/my-reports" element={<div>My reports destination</div>} />
        </Routes>
    </MemoryRouter>
);

// Drives the guided flow forward with valid data, mirroring the reporter's
// Back/Continue path. Step 1 accepts a typed address alone; pinning via the
// mocked map also works.
const advanceWizardTo = async (targetStep) => {
    if (targetStep >= 2) {
        fireEvent.click(await screen.findByTestId('location-map'));
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 2 of 4');
    }
    if (targetStep >= 3) {
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 3 of 4');
    }
    if (targetStep >= 4) {
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 4 of 4');
    }
};

// The step-4 Submit arms ~600ms after arrival so a double-tap meant for
// Continue cannot file the report; wait for it before submitting.
const awaitSubmitArmed = async () => {
    await waitFor(
        () => expect(screen.getByRole('button', { name: /submit report/i })).not.toBeDisabled(),
        { timeout: 5000 }
    );
};

/**
 * Minimal in-memory IndexedDB stand-in for the write-ahead queue: enough of the
 * object-store surface to stage, read back, patch and delete a report.
 */
const installIndexedDbMock = () => {
    const originalIndexedDB = globalThis.indexedDB;
    const storeData = new Map();

    const createRequest = (result) => ({
        result,
        _onsuccess: null,
        get onsuccess() { return this._onsuccess; },
        set onsuccess(fn) {
            this._onsuccess = fn;
            if (typeof fn === 'function') fn();
        },
    });

    const mockStore = {
        put: (entry) => {
            storeData.set(entry.clientReportId, entry);
            return createRequest(entry.clientReportId);
        },
        get: (key) => createRequest(storeData.get(key)),
        getAll: () => createRequest(Array.from(storeData.values())),
        delete: (key) => {
            storeData.delete(key);
            return createRequest(undefined);
        },
        count: () => createRequest(storeData.size),
        clear: () => {
            storeData.clear();
            return createRequest(undefined);
        },
    };

    globalThis.indexedDB = {
        open: () => createRequest({
            objectStoreNames: { contains: () => true },
            transaction: () => {
                const transaction = {
                    objectStore: () => mockStore,
                    oncomplete: null,
                    onerror: null,
                    onabort: null,
                };
                setTimeout(() => transaction.oncomplete?.(), 0);
                return transaction;
            },
        }),
    };

    return {
        storeData,
        restore: () => {
            if (originalIndexedDB !== undefined) {
                globalThis.indexedDB = originalIndexedDB;
            } else {
                delete globalThis.indexedDB;
            }
        },
    };
};

describe('ReportPage workflow', () => {
    let geolocation;
    let watchPositionSuccess;

    beforeEach(() => {
        createReportMock.mockReset();
        // Phase 1 answers with a report id, so the default path exercises the
        // two-phase submit; the legacy all-in-one fallback has its own case.
        createReportMock.mockResolvedValue({ data: { success: true, data: { _id: 'report-1' } } });
        uploadEvidenceMock.mockReset();
        uploadEvidenceMock.mockResolvedValue({ data: { success: true } });
        // Phase-1 submissions record a throughput probe; reset it so the
        // slow-link hint in one test cannot leak into the next.
        resetUploadThroughputForTesting();
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

    test('uses one submission form and starts only one location watcher', async () => {
        const { container } = renderPage();

        expect(container.querySelectorAll('form')).toHaveLength(1);
        expect(geolocation.watchPosition).toHaveBeenCalledTimes(1);
        // The map mounts after the step-1 shell paints (idle-deferred), so the
        // suite waits for it rather than assuming it is there on first paint.
        expect(await screen.findByTestId('location-map')).toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0].mode).toBe('report-location');
    });

    test('paints the step-1 shell before the map, then mounts the map from the same location state', async () => {
        renderPage();

        // First paint: the form shell is interactive while the map chunk is
        // still on its way — the container shows the placeholder, not the map.
        expect(screen.getByText(/preparing map/i)).toBeInTheDocument();
        expect(screen.queryByTestId('location-map')).not.toBeInTheDocument();

        // The deferred mount (requestIdleCallback, setTimeout 300ms fallback
        // where the API is missing) then drops the map in, initialized from
        // the page's own location state.
        const map = await screen.findByTestId('location-map');
        expect(map).toBeInTheDocument();
        const props = mapPropsSpy.mock.lastCall[0];
        expect(props.mode).toBe('report-location');
        expect(props.focusLocation).toBeNull();
        expect(props.selectedLocation).toBeNull();
        expect(props.onLocationSelect).toEqual(expect.any(Function));
    });

    test('blocks Continue on step 1 until a location is provided', () => {
        renderPage();

        // Only the active step is visible.
        expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
        expect(screen.queryByText('Step 2 of 4')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

        expect(screen.getByText('Please select a location on the map or enter an address')).toBeInTheDocument();
        // Still on step 1; nothing was submitted.
        expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
        expect(screen.queryByText('Step 2 of 4')).not.toBeInTheDocument();
        expect(createReportMock).not.toHaveBeenCalled();
    });

    test('blocks Continue on step 2 until the incident time is valid', async () => {
        renderPage();
        await advanceWizardTo(2);

        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        expect(screen.getByText('Accident time is required')).toBeInTheDocument();
        expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
        expect(screen.queryByText('Step 3 of 4')).not.toBeInTheDocument();

        // A future time is rejected as well.
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2099-01-01T10:00' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        expect(screen.getByText('Accident time cannot be in the future')).toBeInTheDocument();
        expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();

        // A valid time advances.
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 3 of 4');
    });

    test('shows one step at a time and keeps entered values when moving back and forth', async () => {
        renderPage();

        expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
        expect(screen.queryByText('Step 2 of 4')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument();

        fireEvent.click(await screen.findByTestId('location-map'));
        await waitFor(() => expect(screen.getByText(/selected pin:/i)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 2 of 4');
        expect(screen.queryByText('Step 1 of 4')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Two motorcycles skidded' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 3 of 4');
        expect(screen.queryByText('Step 2 of 4')).not.toBeInTheDocument();

        // Casualties are optional: blanks mean "not recorded".
        fireEvent.change(screen.getByLabelText(/^injured$/i), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 4 of 4');
        expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();

        // Back through the steps: every entered value is intact.
        fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
        await screen.findByText('Step 3 of 4');
        expect(screen.getByLabelText(/^injured$/i)).toHaveValue(2);

        fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
        await screen.findByText('Step 2 of 4');
        expect(screen.getByLabelText(/description/i)).toHaveValue('Two motorcycles skidded');
        expect(screen.getByLabelText(/incident date and time/i)).toHaveValue('2025-01-15T10:30');

        fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
        await screen.findByText('Step 1 of 4');
        expect(screen.getByText(/selected pin:/i)).toBeInTheDocument();
    });

    test('step 4 shares one action row between Back and Submit, and Back never submits', async () => {
        renderPage();
        await advanceWizardTo(4);

        const backButton = screen.getByRole('button', { name: /^back$/i });
        const submitButton = screen.getByRole('button', { name: /submit report/i });

        // Back and Submit sit side by side in a single action row.
        expect(backButton.parentElement).toBe(submitButton.parentElement);
        // Equal widths: both flex-1, neither content-sized.
        expect(backButton).toHaveClass('flex-1');
        expect(submitButton).toHaveClass('flex-1');
        // The label and arrow travel as one non-wrapping inline group, so
        // "Submit report →" stays on a single line at narrow widths.
        const labelGroup = submitButton.querySelector('.whitespace-nowrap');
        expect(labelGroup).toBeInTheDocument();
        expect(labelGroup).toHaveTextContent('Submit report');
        // Back must never submit the form; Submit stays a real submit control.
        expect(backButton).toHaveAttribute('type', 'button');
        expect(submitButton).toHaveAttribute('type', 'submit');
        // No duplicate submit control anywhere on the page.
        expect(screen.getAllByRole('button', { name: /submit report/i })).toHaveLength(1);

        fireEvent.click(backButton);
        await screen.findByText('Step 3 of 4');
        expect(createReportMock).not.toHaveBeenCalled();
    });

    test('submit stays disarmed briefly after arriving on step 4', async () => {
        renderPage();
        await advanceWizardTo(4);

        const submitButton = screen.getByRole('button', { name: /submit report/i });
        // A stray second tap meant for Continue lands here; it must not file.
        expect(submitButton).toBeDisabled();
        expect(createReportMock).not.toHaveBeenCalled();

        await awaitSubmitArmed();
        expect(submitButton).not.toBeDisabled();
    });

    test('replaces a prior barangay only with the current pin boundary result', async () => {
        renderPage();

        const barangayInput = screen.getByLabelText(/^barangay/i);
        fireEvent.change(barangayInput, { target: { value: 'Gutivan' } });
        fireEvent.click(await screen.findByTestId('location-map'));

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
            expect(screen.getByLabelText(/^barangay/i)).toHaveValue('Taguilos');
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

        const barangayInput = screen.getByLabelText(/^barangay/i);
        fireEvent.change(barangayInput, { target: { value: 'Gutivan' } });
        fireEvent.click(await screen.findByTestId('location-map'));

        await waitFor(() => expect(barangayInput).toHaveValue(''));
        expect(toastMock.error).toHaveBeenCalledWith(
            expect.stringMatching(/barangay could not be verified/i),
            expect.objectContaining({ id: 'app-notification', duration: 2500 })
        );
    });

    test('preserves the multipart report contract and redirects after submission', async () => {
        renderPage();

        // Step 1: an address alone satisfies the location gate.
        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Near Municipal Hall' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 2 of 4');

        // Step 2: incident details.
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Two motorcycles skidded on loose gravel' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 3 of 4');

        // Step 3: casualties.
        fireEvent.change(screen.getByLabelText(/^injured$/i), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 4 of 4');

        // Step 4: review and submit.
        await awaitSubmitArmed();
        fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

        await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
        const payload = createReportMock.mock.calls[0][0];
        expect(payload).toBeInstanceOf(FormData);
        expect(payload.get('incidentCategory')).toBe('accident');
        expect(payload.get('incidentType')).toBe('vehicular');
        expect(payload.get('address')).toBe('Near Municipal Hall');
        expect(payload.get('incidentTime')).toBe(new Date('2025-01-15T10:30').toISOString());
        expect(payload.get('casualties[injured]')).toBe('2');
        expect(payload.get('severity')).toBe('moderate');
        expect(payload.get('description')).toBe('Two motorcycles skidded on loose gravel');
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('hands the map a stable location handler so the memoized map is not rebuilt', async () => {
        // The live map is memoized, which only holds if the props ReportPage
        // owns keep their identity. A handler recreated on every render would
        // re-render the map on every keystroke and every upload progress tick.
        renderPage();

        await waitFor(() => expect(mapPropsSpy).toHaveBeenCalled());
        const firstHandler = mapPropsSpy.mock.calls.at(-1)[0].onLocationSelect;
        mapPropsSpy.mockClear();

        // An unrelated state change while the map step is visible.
        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Near the port' } });

        await waitFor(() => expect(mapPropsSpy).toHaveBeenCalled());
        const secondHandler = mapPropsSpy.mock.calls.at(-1)[0].onLocationSelect;

        expect(secondHandler).toBe(firstHandler);
    });

    test('omits blank casualty fields from the payload instead of sending zeros', async () => {
        // A reporter who does not know the casualty count leaves the fields
        // blank. Sending 0 would misrepresent "not recorded" as "none".
        renderPage();

        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Near Municipal Hall' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 2 of 4');

        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-01-15T10:30' } });
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Casualty count unknown at the scene' } });
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 3 of 4');

        // Casualty fields stay blank.
        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
        await screen.findByText('Step 4 of 4');

        await awaitSubmitArmed();
        fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

        await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
        const payload = createReportMock.mock.calls[0][0];
        expect(payload.get('casualties[injured]')).toBeNull();
        expect(payload.get('casualties[fatalities]')).toBeNull();
        expect(payload.get('casualties[missing]')).toBeNull();
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('updates casualties fields and handles non-zero inputs cleanly', async () => {
        renderPage();
        await advanceWizardTo(3);

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
        test('renders Take photo and Choose photos actions and hidden capture inputs', async () => {
            renderPage();
            await advanceWizardTo(4);

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
            await advanceWizardTo(4);

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
            await advanceWizardTo(4);

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

        test('validates file format, rejecting non-image files', async () => {
            renderPage();
            await advanceWizardTo(4);

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const invalidFile = new File(['text-content'], 'notes.txt', { type: 'text/plain' });

            fireEvent.change(uploadInput, { target: { files: [invalidFile] } });

            expect(toastMock.error).toHaveBeenCalledWith(
                'notes.txt is not an image',
                expect.objectContaining({ id: 'app-notification' })
            );
            expect(screen.getByText(/attached photos \(0\/5\)/i)).toBeInTheDocument();
        });

        test('validates file size, rejecting files over 20 MB', async () => {
            renderPage();
            await advanceWizardTo(4);

            const uploadInput = screen.getByLabelText(/upload evidence photos/i);
            const bigFile = new File(['large-content'], 'huge-photo.jpg', { type: 'image/jpeg' });
            Object.defineProperty(bigFile, 'size', { value: 21 * 1024 * 1024 });

            fireEvent.change(uploadInput, { target: { files: [bigFile] } });

            expect(toastMock.error).toHaveBeenCalledWith(
                'huge-photo.jpg is too large (max 20MB)',
                expect.objectContaining({ id: 'app-notification' })
            );
            expect(screen.getByText(/attached photos \(0\/5\)/i)).toBeInTheDocument();
        });

        test('enforces maximum 5 photos limit and displays limit banner when full', async () => {
            renderPage();
            await advanceWizardTo(4);

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

        test('submits fields first, then uploads each photo to the evidence endpoint', async () => {
            renderPage();

            // Step 1: location via address.
            fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Barangay Road' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 2 of 4');

            // Step 2: incident time.
            fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 3 of 4');

            // Step 3: no casualties to record.
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 4 of 4');

            // Step 4: attach two photos, then submit.
            const cameraInput = screen.getByLabelText(/take evidence photo/i);
            const photoA = new File(['captured-image-a'], 'camera-evidence-a.jpg', { type: 'image/jpeg' });
            const photoB = new File(['captured-image-b'], 'camera-evidence-b.jpg', { type: 'image/jpeg' });
            fireEvent.change(cameraInput, { target: { files: [photoA, photoB] } });

            await waitFor(() => {
                expect(screen.getByText(/attached photos \(2\/5\)/i)).toBeInTheDocument();
            });

            // Photos survive the trip back and forth across steps.
            fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
            await screen.findByText('Step 3 of 4');
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 4 of 4');
            expect(screen.getByText(/attached photos \(2\/5\)/i)).toBeInTheDocument();

            await awaitSubmitArmed();
            fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

            // Phase 1: fields only — no image rides the report POST.
            await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
            const phase1Payload = createReportMock.mock.calls[0][0];
            expect(phase1Payload.getAll('images')).toHaveLength(0);
            expect(phase1Payload.get('clientReportId')).toBeTruthy();
            expect(phase1Payload.get('incidentTime')).toBe(new Date('2025-02-01T08:00').toISOString());

            const config = createReportMock.mock.calls[0][1];
            expect(config).toBeDefined();
            expect(config.timeout).toBe(60000);
            expect(typeof config.onUploadProgress).toBe('function');

            // Phase 2: one evidence POST per photo, in order, against the
            // report id from phase 1.
            await waitFor(() => expect(uploadEvidenceMock).toHaveBeenCalledTimes(2));
            expect(uploadEvidenceMock.mock.calls[0][0]).toBe('report-1');
            expect(uploadEvidenceMock.mock.calls[1][0]).toBe('report-1');
            const firstPhotoBody = uploadEvidenceMock.mock.calls[0][1];
            expect(firstPhotoBody.getAll('images')).toHaveLength(1);
            expect(firstPhotoBody.getAll('images')[0].name).toBe('camera-evidence-a.jpg');
            const secondPhotoBody = uploadEvidenceMock.mock.calls[1][1];
            expect(secondPhotoBody.getAll('images')[0].name).toBe('camera-evidence-b.jpg');
            expect(uploadEvidenceMock.mock.calls[0][2]).toMatchObject({ timeout: 60000 });

            // The reporter learns the report is sent while photos upload.
            await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
                expect.stringMatching(/Report sent! Uploading photos/),
                expect.anything(),
            ));
            await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
                'Report sent! All photos uploaded.',
                expect.anything(),
            ));
            expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        });

        test('falls back to the all-in-one POST when phase 1 returns no report id', async () => {
            // A response with no report id: the legacy single-POST fallback.
            createReportMock.mockResolvedValue({ data: { success: true } });

            renderPage();

            // Step 1: location via address.
            fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Barangay Road' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 2 of 4');

            // Step 2: incident time.
            fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 3 of 4');

            // Step 3: no casualties to record.
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 4 of 4');

            // Step 4: attach a photo, then submit.
            const cameraInput = screen.getByLabelText(/take evidence photo/i);
            const photo = new File(['captured-image'], 'camera-evidence.jpg', { type: 'image/jpeg' });
            fireEvent.change(cameraInput, { target: { files: [photo] } });
            await waitFor(() => {
                expect(screen.getByText(/attached photos \(1\/5\)/i)).toBeInTheDocument();
            });

            await awaitSubmitArmed();
            fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

            // Phase 1 goes out fields-only, then the fallback replays the old
            // all-in-one POST with the photo.
            await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(2));
            expect(createReportMock.mock.calls[0][0].getAll('images')).toHaveLength(0);
            const fallbackPayload = createReportMock.mock.calls[1][0];
            expect(fallbackPayload.getAll('images')).toHaveLength(1);
            expect(fallbackPayload.getAll('images')[0].name).toBe('camera-evidence.jpg');
            // The idempotency key rides both attempts.
            expect(fallbackPayload.get('clientReportId')).toBe(createReportMock.mock.calls[0][0].get('clientReportId'));

            expect(uploadEvidenceMock).not.toHaveBeenCalled();
            expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        });

        test('suggests fewer photos on step 4 when the link measures slow', async () => {
            const originalConnection = Object.getOwnPropertyDescriptor(window.navigator, 'connection');
            Object.defineProperty(window.navigator, 'connection', {
                value: { effectiveType: '2g', saveData: false },
                configurable: true,
            });

            try {
                renderPage();
                await advanceWizardTo(4);

                expect(screen.getByText(/slow connection detected/i)).toBeInTheDocument();
                expect(screen.getByText(/1–2 key photos are enough/i)).toBeInTheDocument();
            } finally {
                if (originalConnection) Object.defineProperty(window.navigator, 'connection', originalConnection);
                else delete window.navigator.connection;
            }
        });

        test('relies on Submit alone: no manual Save offline button, auto-save is stated', async () => {
            renderPage();
            await advanceWizardTo(4);

            // A single primary action: Submit auto-saves when the signal drops,
            // so there is nothing extra for the reporter to remember.
            expect(screen.queryByRole('button', { name: /save offline/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();
            expect(screen.getAllByText(/submitting auto-saves on this device if the signal drops/i).length).toBeGreaterThan(0);
        });
    });

    describe('Offline durability', () => {
        let deviceStorage = null;
        let onlineState = true;

        const setOnline = (value) => {
            onlineState = value;
            Object.defineProperty(window.navigator, 'onLine', {
                configurable: true,
                get: () => onlineState,
            });
        };

        const fillRequiredFields = async () => {
            // Step 1: location via address.
            fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Poblacion, Cajidiocan' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 2 of 4');
            // Step 2: incident time.
            fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 3 of 4');
            // Step 3: casualties optional.
            fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
            await screen.findByText('Step 4 of 4');
        };

        const submitForm = async () => {
            await awaitSubmitArmed();
            fireEvent.click(screen.getByRole('button', { name: /submit report/i }));
        };

        beforeEach(() => {
            // The toast slot collapses identical messages shown within 2.5s of
            // real time; every case below must observe its own message.
            resetToastDedupeForTests();
        });

        afterEach(() => {
            if (deviceStorage) {
                deviceStorage.restore();
                deviceStorage = null;
            }
            setOnline(true);
        });

        test('stores the report before the request leaves and drops it once the server acknowledges', async () => {
            deviceStorage = installIndexedDbMock();
            let stagedBeforeRequest = null;
            createReportMock.mockImplementationOnce(async () => {
                stagedBeforeRequest = Array.from(deviceStorage.storeData.values())[0] || null;
                return { data: { success: true } };
            });

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));

            // The device copy existed before the upload started, and it was
            // leased so the queue would not race the in-flight request.
            expect(stagedBeforeRequest).toMatchObject({ sendingSince: expect.any(Number) });
            expect(stagedBeforeRequest.fields.address).toBe('Poblacion, Cajidiocan');

            await waitFor(() => expect(deviceStorage.storeData.size).toBe(0));
            expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        });

        test('keeps the report queued when the upload is cut off mid-submit', async () => {
            deviceStorage = installIndexedDbMock();
            createReportMock.mockRejectedValueOnce(
                Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' })
            );

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
                'Signal lost while submitting. This report is saved on your device and will be sent automatically once the connection returns.',
                expect.anything()
            ));

            const [entry] = Array.from(deviceStorage.storeData.values());
            expect(entry.fields.address).toBe('Poblacion, Cajidiocan');
            // The lease is released so the retry timer may pick it up at once.
            expect(entry.sendingSince).toBeNull();
            expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        });

        test('keeps the report queued when an intermediary answers instead of the server', async () => {
            // A gateway answering 503 after the upload died looks nothing like a
            // network drop to the reporter, but the report was never filed.
            deviceStorage = installIndexedDbMock();
            createReportMock.mockRejectedValueOnce({
                response: { status: 503, data: { message: 'Service Unavailable' } },
            });

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
                'Signal lost while submitting. This report is saved on your device and will be sent automatically once the connection returns.',
                expect.anything()
            ));
            expect(deviceStorage.storeData.size).toBe(1);
            expect(Array.from(deviceStorage.storeData.values())[0].sendingSince).toBeNull();
        });

        test('drops the device copy when the server rejects the content and shows its message', async () => {
            deviceStorage = installIndexedDbMock();
            createReportMock.mockRejectedValueOnce({
                response: { status: 400, data: { message: 'Barangay is required' } },
            });

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(
                'Barangay is required',
                expect.anything()
            ));

            // Replaying a refused report would fail forever and bury the reason.
            expect(deviceStorage.storeData.size).toBe(0);
            expect(screen.queryByText('My reports destination')).not.toBeInTheDocument();
        });

        test('keeps the reporter on the form when the device cannot store the report and the send fails', async () => {
            // No storage stub: jsdom has no IndexedDB, which is also the state of
            // a private-mode session or a browser with storage blocked.
            createReportMock.mockRejectedValueOnce(new Error('Network Error'));

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(
                'This device could not store the report locally. Keep this screen open and retry, or free up storage.',
                expect.anything()
            ));

            // Navigating away would hide a report that no longer exists anywhere.
            expect(screen.queryByText('My reports destination')).not.toBeInTheDocument();
        });

        test('skips a doomed request while offline and stores the report instead', async () => {
            setOnline(false);
            deviceStorage = installIndexedDbMock();

            renderPage();
            await fillRequiredFields();
            await submitForm();

            await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(
                'You are offline. This report is saved on your device and will be sent automatically.',
                expect.anything()
            ));

            // No route to the server: the request is not even attempted.
            expect(createReportMock).not.toHaveBeenCalled();
            // Nothing is sending it, so no lease is held and the queue may deliver
            // it as soon as there is a connection.
            expect(Array.from(deviceStorage.storeData.values())[0].sendingSince).toBeNull();
            expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        });
    });

    describe('Mobile UI Refinements & Location State Clarity', () => {
        test('renders device-neutral instructions and secondary required field guidance', () => {
            renderPage();

            expect(screen.getByText(/select a location on the map or use gps to set the incident coordinates/i)).toBeInTheDocument();
            expect(screen.getByText(/address or coordinates are required/i)).toBeInTheDocument();
        });

        test('displays unpinned default island view chip initially, then updates to coordinates when pinned', async () => {
            renderPage();

            // Unpinned default state shows default island view
            expect(screen.getByText('Default island view · No pin placed')).toBeInTheDocument();
            // The GPS status badge shares role="status" with the deferred map's
            // "Preparing map..." placeholder on first paint, so pick it out by
            // its text rather than assuming it is the only status region.
            const statuses = screen.getAllByRole('status');
            expect(statuses.some((el) => el.textContent.includes('Acquiring GPS'))).toBe(true);

            // Pin a location
            fireEvent.click(await screen.findByTestId('location-map'));

            await waitFor(() => {
                expect(screen.getByText(/selected pin: 12\.3926, 122\.6799/i)).toBeInTheDocument();
                expect(screen.getByRole('status')).toHaveTextContent('Location selected');
            });
        });

        test('renders 4-segment progress cues and accessible status transitions', async () => {
            renderPage();

            // The guided flow shows one step at a time; the top indicator names
            // all four steps and each step header keeps its 4-segment cue.
            expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
            expect(screen.queryByText('Step 2 of 4')).not.toBeInTheDocument();
            const progressNav = screen.getByRole('navigation', { name: /report progress/i });
            expect(progressNav).toHaveTextContent('Location');
            expect(progressNav).toHaveTextContent('Details');
            expect(progressNav).toHaveTextContent('Casualties');
            expect(progressNav).toHaveTextContent('Evidence & review');

            // My location button with accessible label
            const myLocationBtn = screen.getByRole('button', { name: /use my current gps location/i });
            expect(myLocationBtn).toBeInTheDocument();

            // Once location is pinned, detection stops and button displays My location
            fireEvent.click(await screen.findByTestId('location-map'));
            await waitFor(() => {
                expect(myLocationBtn).toHaveTextContent('My location');
            });
        });
    });
});
