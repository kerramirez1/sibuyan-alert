import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockMapInstances = [];
const mockSetLayoutProperty = vi.fn();
const mockGetLayer = vi.fn((id) => ({ id }));
const mockSetMaxZoom = vi.fn();
const mockEaseTo = vi.fn();
const mockOnCallbacks = {};
const mockAddControl = vi.fn();
const mockAddSource = vi.fn();
const mockAddLayer = vi.fn();
const mockRemove = vi.fn();

vi.mock('maplibre-gl', () => ({
    default: {
        addProtocol: vi.fn(),
        Map: vi.fn(function (options) {
            this.options = options;
            this.setLayoutProperty = mockSetLayoutProperty;
            this.getLayer = mockGetLayer;
            this.getMaxZoom = vi.fn(() => 16);
            this.setMaxZoom = mockSetMaxZoom;
            this.getZoom = vi.fn(() => 11);
            this.easeTo = mockEaseTo;
            this.addControl = mockAddControl;
            this.addSource = mockAddSource;
            this.addLayer = mockAddLayer;
            this.getSource = vi.fn(() => ({ setData: vi.fn() }));
            this.remove = mockRemove;
            this.on = vi.fn((event, cb) => {
                mockOnCallbacks[event] = cb;
                if (event === 'load') {
                    setTimeout(cb, 0);
                }
            });
            this.scrollZoom = { disable: vi.fn(), enable: vi.fn() };
            mockMapInstances.push(this);
        }),
        NavigationControl: vi.fn(),
        AttributionControl: vi.fn(),
        Marker: vi.fn(function () {
            this.setLngLat = vi.fn().mockReturnThis();
            this.addTo = vi.fn().mockReturnThis();
            this.remove = vi.fn();
        }),
        Popup: vi.fn(function () {
            this.setLngLat = vi.fn().mockReturnThis();
            this.setHTML = vi.fn().mockReturnThis();
            this.addTo = vi.fn().mockReturnThis();
            this.remove = vi.fn();
        }),
    },
}));

const createPmtilesHeader = ({ minZoom = 0, maxZoom = 14 } = {}) => {
    const bytes = new ArrayBuffer(16384);
    const view = new DataView(bytes);
    view.setUint16(0, 0x4d50, true);
    view.setUint8(7, 3);
    view.setUint8(99, 1);
    view.setUint8(100, minZoom);
    view.setUint8(101, maxZoom);
    view.setInt32(102, Math.round(122.45 * 10000000), true);
    view.setInt32(106, Math.round(12.30 * 10000000), true);
    view.setInt32(110, Math.round(122.70 * 10000000), true);
    view.setInt32(114, Math.round(12.55 * 10000000), true);
    return bytes;
};

const createRangeResponse = (bytes, status = 206) => ({
    status,
    headers: {
        get: (name) => {
            const headers = {
                'content-range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
                'cache-control': 'public, max-age=86400',
                etag: '"test-map"',
            };
            return headers[name.toLowerCase()] || null;
        },
    },
    arrayBuffer: async () => bytes,
});

import MapView from '../components/map/MapView';
import maplibregl from 'maplibre-gl';
import {
    LABELS_3D_SOURCE_ID,
    PMTILES_SOURCE_ID,
    STREET_FALLBACK_LAYER_ID,
} from '../config/mapProvider';

describe('MapView 3D Vector Label Rendering & Mode Switching', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMapInstances.length = 0;
        Object.keys(mockOnCallbacks).forEach((k) => delete mockOnCallbacks[k]);
        // Set dedicated 3D labels URL, while street PMTiles is empty
        vi.stubEnv('VITE_3D_LABELS_PMTILES_URL', 'https://maps.example.gov/sibuyan-labels.pmtiles');
        vi.stubEnv('VITE_PMTILES_URL', '');
        const bytes = createPmtilesHeader();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createRangeResponse(bytes)));
    });

    test('3D/satellite mode displays vector labels from dedicated source and hides esri-reference-layer', async () => {
        render(<MapView reports={[]} />);

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });

        const mapCall = maplibregl.Map.mock.calls[0][0];
        expect(mapCall.style).toBeDefined();
        // Dedicated 3D labels source is loaded
        expect(mapCall.style.sources[LABELS_3D_SOURCE_ID]).toBeDefined();
        // Street PMTiles source is NOT loaded
        expect(mapCall.style.sources[PMTILES_SOURCE_ID]).toBeUndefined();

        // In default satellite mode with mapReady:
        // - esri-imagery-layer is visible
        // - 3d-label-* vector label layers are visible
        // - esri-reference-layer is hidden
        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-imagery-layer', 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('3d-label-places_subplace', 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('3d-label-places_locality', 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-reference-layer', 'visibility', 'none');
        });
    });

    test('street mode preserves standard street provider and hides 3D vector labels', async () => {
        render(<MapView reports={[]} />);

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });

        // Switch to Street mode
        const streetsButton = screen.getByRole('button', { name: /switch to street map/i });
        fireEvent.click(streetsButton);

        // In street mode:
        // - Standard street fallback layer is visible
        // - 3d-label-* layers are explicitly hidden
        // - esri-imagery-layer is hidden
        // - esri-reference-layer is hidden
        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith(STREET_FALLBACK_LAYER_ID, 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('3d-label-places_subplace', 'visibility', 'none');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-imagery-layer', 'visibility', 'none');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-reference-layer', 'visibility', 'none');
        });

        // Switch back to Satellite mode
        const satelliteButton = screen.getByRole('button', { name: /switch to satellite map/i });
        fireEvent.click(satelliteButton);

        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('3d-label-places_subplace', 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith(STREET_FALLBACK_LAYER_ID, 'visibility', 'none');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-imagery-layer', 'visibility', 'visible');
            expect(mockSetLayoutProperty).toHaveBeenCalledWith('esri-reference-layer', 'visibility', 'none');
        });
    });

    test('retains risk zones and incident markers when layers are updated', async () => {
        const mockReports = [
            {
                _id: 'report-1',
                latitude: 12.45,
                longitude: 122.55,
                status: 'verified',
                incidentCategory: 'road_accident',
            },
        ];
        const mockZones = [
            {
                _id: 'zone-1',
                center: [122.55, 12.45],
                radius: 1.5,
                riskLevel: 'critical',
            },
        ];

        render(<MapView reports={mockReports} highRiskZones={mockZones} showRiskZones={true} />);

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });

        // Verify risk zone layer addition on load
        await waitFor(() => {
            expect(mockAddSource).toHaveBeenCalled();
            expect(mockAddLayer).toHaveBeenCalled();
        });
    });

    test('renders marker for resolved incident report in incident-preview mode', async () => {
        const resolvedReport = {
            _id: 'resolved-cambajao',
            coordinates: { lat: 12.363035, lng: 122.685384 },
            status: 'resolved',
            incidentCategory: 'accident',
            title: 'Sibuyan Circumferential Road, Cambajao',
        };

        render(
            <MapView
                reports={[resolvedReport]}
                mode="incident-preview"
                focusLocation={{ ...resolvedReport.coordinates, zoom: 16 }}
            />
        );

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalled();
            expect(maplibregl.Marker).toHaveBeenCalled();
        });
    });
});
