// TEMPORARY validation harness (deleted after this task).
//
// vitest's direct import is broken in this environment and hoisted `vi.mock`
// factories do not apply, so collaborators are stubbed by mutating the exported
// objects instead — the same wiring ReportPage reads at call time.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../router';
import { reportsAPI } from '../services/api';
import appToast, { resetToastDedupeForTests } from '../utils/appToast';
import ReportPage from '../pages/ReportPage';

const installIndexedDbStub = () => {
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

    const store = {
        put: (entry) => { storeData.set(entry.clientReportId, entry); return createRequest(entry.clientReportId); },
        get: (key) => createRequest(storeData.get(key)),
        getAll: () => createRequest(Array.from(storeData.values())),
        delete: (key) => { storeData.delete(key); return createRequest(undefined); },
        count: () => createRequest(storeData.size),
        clear: () => { storeData.clear(); return createRequest(undefined); },
    };

    globalThis.indexedDB = {
        open: () => createRequest({
            objectStoreNames: { contains: () => true },
            transaction: () => {
                const transaction = { objectStore: () => store, oncomplete: null, onerror: null, onabort: null };
                setTimeout(() => transaction.oncomplete?.(), 0);
                return transaction;
            },
        }),
    };

    return {
        storeData,
        restore: () => {
            if (originalIndexedDB !== undefined) globalThis.indexedDB = originalIndexedDB;
            else delete globalThis.indexedDB;
        },
    };
};

const renderPage = () => render(
    <MemoryRouter initialEntries={['/report']}>
        <Routes>
            <Route path="/report" element={<ReportPage />} />
            <Route path="/my-reports" element={<div>My reports destination</div>} />
        </Routes>
    </MemoryRouter>
);

describe('ReportPage write-ahead (integration harness)', () => {
    let createMock;
    let successSpy;
    let errorSpy;
    let storage = null;
    let online = true;

    const setOnline = (value) => {
        online = value;
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
    };

    const fillRequiredFields = () => {
        fireEvent.change(screen.getByLabelText(/address or landmark/i), { target: { value: 'Poblacion, Cajidiocan' } });
        fireEvent.change(screen.getByLabelText(/incident date and time/i), { target: { value: '2025-02-01T08:00' } });
    };

    const submitForm = () => fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

    beforeEach(() => {
        resetToastDedupeForTests();
        createMock = vi.fn(async () => ({ data: { success: true } }));
        reportsAPI.create = createMock;
        reportsAPI.geocodeLocation = vi.fn(async () => ({
            data: { data: { address: 'Poblacion', barangay: { name: 'Poblacion' } } },
        }));
        successSpy = vi.fn();
        errorSpy = vi.fn();
        // The real appToast appends { id, duration }; the harness pads the same
        // second argument so the assertions match the production call shape.
        appToast.success = (message, options = { id: 'app-notification' }) => successSpy(message, options);
        appToast.error = (message, options = { id: 'app-notification' }) => errorSpy(message, options);
        setOnline(true);
    });

    afterEach(() => {
        if (storage) { storage.restore(); storage = null; }
        setOnline(true);
    });

    test('stores the report before the request leaves and drops it once the server acknowledges', async () => {
        storage = installIndexedDbStub();
        let stagedAtRequest = null;
        createMock.mockImplementationOnce(async () => {
            stagedAtRequest = Array.from(storage.storeData.values())[0] || null;
            return { data: { success: true } };
        });

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
        expect(stagedAtRequest).toMatchObject({ sendingSince: expect.any(Number) });
        expect(stagedAtRequest.fields.address).toBe('Poblacion, Cajidiocan');

        await waitFor(() => expect(storage.storeData.size).toBe(0));
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('keeps the report queued when the upload is cut off mid-submit', async () => {
        storage = installIndexedDbStub();
        createMock.mockRejectedValueOnce(
            Object.assign(new Error('timeout of 60000ms exceeded'), { code: 'ECONNABORTED' })
        );

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(successSpy).toHaveBeenCalledWith(
            'Signal lost while submitting. This report is saved on your device and will be sent automatically once the connection returns.',
            expect.anything()
        ));

        const [entry] = Array.from(storage.storeData.values());
        expect(entry.fields.address).toBe('Poblacion, Cajidiocan');
        expect(entry.sendingSince).toBeNull();
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });

    test('keeps the report queued when an intermediary answers 503 instead of the server', async () => {
        storage = installIndexedDbStub();
        createMock.mockRejectedValueOnce({ response: { status: 503, data: { message: 'Service Unavailable' } } });

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(successSpy).toHaveBeenCalledWith(
            'Signal lost while submitting. This report is saved on your device and will be sent automatically once the connection returns.',
            expect.anything()
        ));
        expect(storage.storeData.size).toBe(1);
        expect(Array.from(storage.storeData.values())[0].sendingSince).toBeNull();
    });

    test('drops the device copy when the server rejects the content', async () => {
        storage = installIndexedDbStub();
        createMock.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Barangay is required' } } });

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Barangay is required', expect.anything()));
        expect(storage.storeData.size).toBe(0);
        expect(screen.queryByText('My reports destination')).not.toBeInTheDocument();
    });

    test('keeps the reporter on the form when the device cannot store the report and the send fails', async () => {
        createMock.mockRejectedValueOnce(new Error('Network Error'));

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(errorSpy).toHaveBeenCalledWith(
            'This device could not store the report locally. Keep this screen open and retry, or free up storage.',
            expect.anything()
        ));
        expect(screen.queryByText('My reports destination')).not.toBeInTheDocument();
    });

    test('skips a doomed request while offline and stores the report instead', async () => {
        setOnline(false);
        storage = installIndexedDbStub();

        renderPage();
        fillRequiredFields();
        submitForm();

        await waitFor(() => expect(successSpy).toHaveBeenCalledWith(
            'You are offline. This report is saved on your device and will be sent automatically.',
            expect.anything()
        ));

        expect(createMock).not.toHaveBeenCalled();
        expect(Array.from(storage.storeData.values())[0].sendingSince).toBeNull();
        expect(await screen.findByText('My reports destination')).toBeInTheDocument();
    });
});
