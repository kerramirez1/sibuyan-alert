import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockMapInstances = [];
const mockAddControl = vi.fn();
const mockAddSource = vi.fn();
const mockAddLayer = vi.fn();
const mockGetSource = vi.fn();
const mockRemove = vi.fn();
const mockOn = vi.fn();
const mockEaseTo = vi.fn();

vi.mock('maplibre-gl', () => ({
    default: {
        supported: vi.fn(() => true),
        addProtocol: vi.fn(),
        Map: vi.fn(function (options) {
            this.options = options;
            this.addControl = mockAddControl;
            this.addSource = mockAddSource;
            this.addLayer = mockAddLayer;
            this.getSource = mockGetSource;
            this.getLayer = vi.fn((_id) => null);
            this.remove = mockRemove;
            this.on = vi.fn((event, cb) => {
                mockOn(event, cb);
                if (event === 'load') {
                    setTimeout(cb, 0);
                }
            });
            this.easeTo = mockEaseTo;
            this.scrollZoom = { disable: vi.fn(), enable: vi.fn() };
            mockMapInstances.push(this);
        }),
        NavigationControl: vi.fn(),
        AttributionControl: vi.fn(),
    },
}));

import HighRisk3DMap from '../components/map/HighRisk3DMap';
import maplibregl from 'maplibre-gl';
import {
    RISK_ZONE_EXTRUSION_LAYER_ID,
    RISK_ZONE_MIN_ZOOM,
    RISK_ZONE_SOURCE_ID,
} from '../utils/riskZoneVisualization';

describe('HighRisk3DMap Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockMapInstances.length = 0;
        // Avoid real network for the default /maps/*.pmtiles env URL: fail
        // validation fast so the Esri fallback style mounts deterministically.
        vi.stubEnv('VITE_3D_LABELS_PMTILES_URL', '');
        vi.stubEnv('VITE_PMTILES_URL', '');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    });

    test('renders 3D visualization mode legend and controls', () => {
        render(<HighRisk3DMap highRiskZones={[]} />);

        expect(screen.getByText('3D Visualization Mode')).toBeInTheDocument();
        expect(screen.getByText('Critical Risk')).toBeInTheDocument();
        expect(screen.getByText('High Risk')).toBeInTheDocument();
        expect(screen.getByText('Medium Risk')).toBeInTheDocument();
        expect(screen.getByText('Low Risk')).toBeInTheDocument();
        expect(screen.getByText('Ctrl+Drag to rotate & tilt')).toBeInTheDocument();
    });

    test('initializes MapLibre with 3D pitch, bearing, and prepared 3D vector label style', async () => {
        render(<HighRisk3DMap highRiskZones={[]} />);

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });

        const options = maplibregl.Map.mock.calls[0][0];
        expect(options.pitch).toBe(55);
        expect(options.bearing).toBe(-15);
        expect(options.style).toBeDefined();
        expect(options.style.layers.some((l) => l.id === 'esri-imagery-layer')).toBe(true);
    });

    test('attaches risk zone extrusion layer and source on map load', async () => {
        render(<HighRisk3DMap highRiskZones={[]} />);

        await waitFor(() => {
            expect(mockAddSource).toHaveBeenCalledWith(
                RISK_ZONE_SOURCE_ID,
                expect.objectContaining({ type: 'geojson' })
            );
        });

        expect(mockAddLayer).toHaveBeenCalledWith(
            expect.objectContaining({
                id: RISK_ZONE_EXTRUSION_LAYER_ID,
                type: 'fill-extrusion',
                source: RISK_ZONE_SOURCE_ID,
                minzoom: RISK_ZONE_MIN_ZOOM,
            })
        );
    });

    test('cleans up map instance on unmount', async () => {
        const { unmount } = render(<HighRisk3DMap highRiskZones={[]} />);

        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });

        unmount();
        expect(mockRemove).toHaveBeenCalledTimes(1);
    });
});
