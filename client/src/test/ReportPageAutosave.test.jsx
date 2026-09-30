import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';

const { createReportMock, geocodeLocationMock, toastMock } = vi.hoisted(() => ({
    createReportMock: vi.fn(),
    geocodeLocationMock: vi.fn(),
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

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ user: { _id: 'reporter-1', role: 'reporter', isVerified: true } }),
}));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="location-map" />,
}));

import ReportPage from '../pages/ReportPage';
import { REPORT_DRAFT_STORAGE_KEY } from '../config/reportSubmission';
import { resetToastDedupeForTests } from '../utils/appToast';

const renderPage = () => render(
    <MemoryRouter initialEntries={['/report']}>
        <Routes>
            <Route path="/report" element={<ReportPage />} />
            <Route path="/my-reports" element={<div>My reports destination</div>} />
        </Routes>
    </MemoryRouter>
);

// Walks the guided flow to the review step with valid data.
const advanceWizardToReview = async () => {
    fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Poblacion, Cajidiocan' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByText('Step 2 of 4');
    fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByText('Step 3 of 4');
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    await screen.findByText('Step 4 of 4');
};

const installIndexedDbMock = () => {
    const originalIndexedDB = globalThis.indexedDB;
    const storeData = new Map();
    const createRequest = (result) => {
        const request = { result };
        Object.defineProperty(request, 'onsuccess', {
            configurable: true,
            get() { return this._onsuccess; },
            set(fn) {
                this._onsuccess = fn;
                if (typeof fn === 'function') fn();
            },
        });
        return request;
    };
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

describe('ReportPage automatic offline save', () => {
    let deviceStorage = null;

    beforeEach(() => {
        createReportMock.mockReset();
        createReportMock.mockResolvedValue({ data: { success: true } });
        geocodeLocationMock.mockReset();
        geocodeLocationMock.mockResolvedValue({ data: { data: {} } });
        Object.values(toastMock).forEach((mock) => mock.mockClear());
        resetToastDedupeForTests();
        try {
            localStorage.clear();
        } catch {
            // Storage unavailable: draft assertions fall back to null paths.
        }
        Object.defineProperty(window.navigator, 'geolocation', {
            configurable: true,
            value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
        });
        Object.defineProperty(window.navigator, 'onLine', {
            configurable: true,
            get: () => true,
        });
        deviceStorage = installIndexedDbMock();
    });

    afterEach(() => {
        try {
            deviceStorage?.restore();
        } catch {
            // Restore is best-effort in jsdom.
        }
        deviceStorage = null;
    });

    test('passes an abort signal so a mid-upload signal loss queues at once', async () => {
        renderPage();
        await advanceWizardToReview();

        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        await waitFor(() => expect(createReportMock).toHaveBeenCalledTimes(1));
        const config = createReportMock.mock.calls[0][1];
        expect(config.signal).toBeInstanceOf(AbortSignal);
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('tells the reporter the report is safe on-device while the upload runs', async () => {
        let resolveUpload;
        createReportMock.mockImplementationOnce(() => new Promise((resolve) => {
            resolveUpload = resolve;
        }));

        renderPage();
        await advanceWizardToReview();

        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        // Staged before the network answers: the safety banner appears mid-flight.
        expect(await screen.findByText(/saved on this device — sending to dispatch/i)).toBeInTheDocument();

        resolveUpload({ data: { success: true } });
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('restores an unfinished draft and discards it on demand', async () => {
        localStorage.setItem(REPORT_DRAFT_STORAGE_KEY, JSON.stringify({
            version: 1,
            updatedAt: Date.now(),
            formData: {
                incidentCategory: 'accident',
                incidentType: 'vehicular',
                description: '',
                address: 'Draft address from pocket',
                barangay: '',
                incidentTime: '2025-02-01T08:00',
                severity: 'moderate',
                casualties: { injured: '', fatalities: '', missing: '' },
            },
            selectedLocation: { lat: 12.39261, lng: 122.67985 },
            locationCapture: null,
        }));

        renderPage();

        expect(await screen.findByText(/unfinished draft restored/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/address or landmark/i)).toHaveValue('Draft address from pocket');

        fireEvent.click(screen.getByRole('button', { name: /discard draft/i }));
        expect(screen.getByLabelText(/address or landmark/i)).toHaveValue('');
        expect(localStorage.getItem(REPORT_DRAFT_STORAGE_KEY)).toBeNull();
    });

    test('clears the draft once the report is submitted', async () => {
        renderPage();
        await advanceWizardToReview();

        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
        expect(localStorage.getItem(REPORT_DRAFT_STORAGE_KEY)).toBeNull();
    });
});
