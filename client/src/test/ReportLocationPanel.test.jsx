import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ReportLocationPanel from '../components/report/ReportLocationPanel';

const mapViewProps = { current: null };

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapViewProps.current = props;
        return <div data-testid="mock-map-view" />;
    },
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

describe('ReportLocationPanel deferred map mount', () => {
    test('shows the placeholder instead of the map until the deferred mount is ready', () => {
        render(<ReportLocationPanel {...baseProps} mapMountReady={false} />);

        expect(screen.getByText(/preparing map/i)).toBeInTheDocument();
        expect(screen.queryByTestId('mock-map-view')).not.toBeInTheDocument();
        // The form shell itself is unaffected: fields stay interactive.
        expect(screen.getByLabelText(/address or landmark/i)).toBeInTheDocument();
    });

    test('mounts the map immediately when the deferred mount is ready', () => {
        render(<ReportLocationPanel {...baseProps} mapMountReady />);
        expect(screen.getByTestId('mock-map-view')).toBeInTheDocument();
        expect(screen.queryByText(/preparing map/i)).not.toBeInTheDocument();
    });
});

describe('ReportLocationPanel offline fallback', () => {
    // The in-map "My location" action and the prominent fallback action share
    // the same aria-label; the prominent one is the full-width row whose
    // visible text is the GPS sentence (the in-map button reads "My location").
    const prominentGpsButton = () => screen
        .getAllByRole('button', { name: /use my current gps location/i })
        .find((button) => button.textContent.trim() === 'Use my current GPS location');

    test('surfaces the GPS action prominently while the map is in its offline fallback', () => {
        const detectLocation = vi.fn();
        render(<ReportLocationPanel {...baseProps} detectLocation={detectLocation} />);

        // No fallback yet: only the in-map action exists.
        expect(prominentGpsButton()).toBeUndefined();

        act(() => {
            mapViewProps.current.onOfflineFallbackChange(true);
        });

        // The prominent action appears below the map and reuses the same
        // handler — no duplicated GPS logic.
        const gpsButton = prominentGpsButton();
        expect(gpsButton).toBeDefined();
        fireEvent.click(gpsButton);
        expect(detectLocation).toHaveBeenCalledTimes(1);

        // Leaving the fallback hides it again.
        act(() => {
            mapViewProps.current.onOfflineFallbackChange(false);
        });
        expect(prominentGpsButton()).toBeUndefined();
    });
});
