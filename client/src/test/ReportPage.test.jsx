import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { createReportMock, toastMock } = vi.hoisted(() => ({
    createReportMock: vi.fn(),
    toastMock: {
        loading: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('../services/api', () => ({
    reportsAPI: { create: createReportMock },
}));

vi.mock('react-hot-toast', () => ({ default: toastMock }));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="location-map" />,
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

    beforeEach(() => {
        createReportMock.mockReset();
        createReportMock.mockResolvedValue({ data: { success: true } });
        Object.values(toastMock).forEach((mock) => mock.mockClear());
        geolocation = {
            watchPosition: vi.fn(() => 7),
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
    });

    test('shows accessible feedback when required fields are missing', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: /submit incident report/i }));

        expect(screen.getByRole('alert')).toHaveTextContent(/complete the required location and incident-time fields/i);
        expect(screen.getByText('Accident time is required')).toBeInTheDocument();
        expect(createReportMock).not.toHaveBeenCalled();
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
