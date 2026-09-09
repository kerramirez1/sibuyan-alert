import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import IncidentLocationPreview from '../components/adminReports/IncidentLocationPreview';

const mockMapView = vi.fn();

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mockMapView(props);
        return <div data-testid="mock-map-view" />;
    },
}));

describe('IncidentLocationPreview', () => {
    beforeEach(() => {
        mockMapView.mockClear();
    });

    test('renders interactive location preview with coordinates and MapView configured for incident preview', () => {
        const report = {
            _id: 'report-123',
            address: 'M. Aquino Street, Poblacion',
            barangay: 'Poblacion',
            municipalityName: 'Cajidiocan',
            status: 'verified',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        };
        const onOpenMap = vi.fn();

        render(
            <IncidentLocationPreview
                report={report}
                userRole="municipal_admin"
                onOpenMap={onOpenMap}
            />
        );

        expect(screen.getByText('Pinned location')).toBeInTheDocument();
        expect(screen.getByText('M. Aquino Street, Poblacion')).toBeInTheDocument();
        expect(screen.getByText('12.404400, 122.689700')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Open full map/i })).toBeInTheDocument();
        expect(screen.getByTestId('incident-location-preview')).toBeInTheDocument();

        // Verify MapView is configured for interactive incident preview without scroll zoom disabled
        expect(mockMapView).toHaveBeenCalledWith(
            expect.objectContaining({
                reports: [report],
                mode: 'incident-preview',
                disableScrollZoom: false,
                enable3D: false,
                focusLocation: { lat: 12.4044, lng: 122.6897, zoom: 16 },
                filterMode: 'review',
            })
        );
    });

    test('renders interactive location preview for resolved incident with correct filterStatus', () => {
        const report = {
            _id: 'report-resolved-1',
            address: 'Sibuyan Circumferential Road, Cambajao',
            barangay: 'Cambajao',
            municipalityName: 'Cajidiocan',
            status: 'resolved',
            coordinates: { lat: 12.363035, lng: 122.685384 },
        };
        const onOpenMap = vi.fn();

        render(
            <IncidentLocationPreview
                report={report}
                userRole="municipal_admin"
                onOpenMap={onOpenMap}
            />
        );

        expect(screen.getByText('Pinned location')).toBeInTheDocument();
        expect(screen.getByText('Sibuyan Circumferential Road, Cambajao')).toBeInTheDocument();
        expect(screen.getByText('12.363035, 122.685384')).toBeInTheDocument();

        expect(mockMapView).toHaveBeenCalledWith(
            expect.objectContaining({
                reports: [report],
                mode: 'incident-preview',
                filterStatus: 'resolved',
                focusLocation: { lat: 12.363035, lng: 122.685384, zoom: 16 },
            })
        );
    });

    test('renders unavailable fallback when coordinates are missing', () => {
        const report = {
            _id: 'report-456',
            address: 'Unknown location',
            status: 'pending',
        };

        render(
            <IncidentLocationPreview
                report={report}
                userRole="responder"
                onOpenMap={vi.fn()}
            />
        );

        expect(screen.getByText('Location coordinates unavailable.')).toBeInTheDocument();
        expect(screen.queryByTestId('incident-location-preview')).not.toBeInTheDocument();
        expect(mockMapView).not.toHaveBeenCalled();
    });
});
