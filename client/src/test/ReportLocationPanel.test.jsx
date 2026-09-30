import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReportLocationPanel from '../components/report/ReportLocationPanel';

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="mock-map-view" />,
}));

const baseProps = {
    locationStatus: 'confirming',
    geoLoading: false,
    gpsAccuracy: 12.4,
    selectedLocation: { lat: 12.3456, lng: 122.3456 },
    userLocation: null,
    focusLocation: null,
    detectLocation: vi.fn(),
    retryLocation: vi.fn(),
    confirmLocation: vi.fn(),
    handleLocationSelect: vi.fn(),
    formData: { address: '', barangay: '' },
    handleChange: vi.fn(),
    locationError: '',
};

describe('ReportLocationPanel GPS confirmation row', () => {
    test('keeps Adjust and Confirm location side by side on one line each', () => {
        render(<ReportLocationPanel {...baseProps} />);

        const adjustButton = screen.getByRole('button', { name: /^adjust$/i });
        const confirmButton = screen.getByRole('button', { name: /^confirm location$/i });

        // Side by side in a single two-column row.
        expect(adjustButton.parentElement).toBe(confirmButton.parentElement);
        // Labels must not wrap at narrow widths: no clipping, no overflow.
        expect(adjustButton).toHaveClass('whitespace-nowrap');
        expect(confirmButton).toHaveClass('whitespace-nowrap');
        // Compact narrow-screen geometry without touching wider breakpoints.
        for (const button of [adjustButton, confirmButton]) {
            expect(button).toHaveClass('max-[420px]:min-h-10');
            expect(button).toHaveClass('max-[420px]:px-3');
        }
    });

    test('preserves actions, handlers, and visual hierarchy', () => {
        render(<ReportLocationPanel {...baseProps} />);

        const adjustButton = screen.getByRole('button', { name: /^adjust$/i });
        const confirmButton = screen.getByRole('button', { name: /^confirm location$/i });

        // Both stay plain buttons: neither submits a form.
        expect(adjustButton).toHaveAttribute('type', 'button');
        expect(confirmButton).toHaveAttribute('type', 'button');
        // Visual hierarchy unchanged: outline for the secondary action,
        // primary for the confirm action.
        expect(adjustButton).toHaveClass('btn-outline');
        expect(confirmButton).toHaveClass('btn-primary');
        // Existing handlers still wired.
        fireEvent.click(adjustButton);
        expect(baseProps.retryLocation).toHaveBeenCalledTimes(1);
        fireEvent.click(confirmButton);
        expect(baseProps.confirmLocation).toHaveBeenCalledTimes(1);
    });

    test('hides the confirmation row outside the confirming state', () => {
        render(<ReportLocationPanel {...baseProps} locationStatus="selected" />);
        expect(screen.queryByRole('button', { name: /^confirm location$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^adjust$/i })).not.toBeInTheDocument();
    });
});
