import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// `vi.hoisted` because the mock factory below is hoisted above this file's
// declarations, and a control reference inside it would be read before it
// exists. The other mocks survive it by only being touched from inside bodies
// that run later; this one is a plain property.
const { mockFullscreenControl } = vi.hoisted(() => ({ mockFullscreenControl: vi.fn() }));

const mockMapInstances = [];
const mockSetLayoutProperty = vi.fn();
const LOAD_ADDED_IDS = new Set([
    'risk-zone-source',
    'risk-zones',
    'user-location',
    'gps-accuracy',
]);
// Fresh maps have no sources/layers: get* returns null so the component's
// idempotent ensureSource/ensureLayer path adds them (prod behavior). Style
// layers queried later for visibility toggles report as existing.
// Accident-prone layers are added by a data effect after mount (like the hazard
// layers), so the mock has to remember what was added: absent before
// `addSource`/`addLayer`, present after. Without that memory the effect would
// look like it re-adds them on every toggle, and the "switching a class never
// rebuilds anything" assertion would be untestable.
const addedLayerIds = new Set();
const addedSourceIds = new Set();
const mockSetData = vi.fn();
const mockGetLayer = vi.fn((id) => {
    if (typeof id === 'string' && (id.includes('risk-zone') || id.includes('risk_zone') || id.includes('user-location') || id.includes('gps-accuracy'))) {
        return LOAD_ADDED_IDS.has(id) ? { id } : null;
    }
    if (typeof id === 'string' && id.includes('accident-hotspot')) {
        return addedLayerIds.has(id) ? { id } : null;
    }
    return { id };
});
const mockGetSource = vi.fn((id) => {
    if (typeof id === 'string' && (id.includes('risk-zone') || id.includes('risk_zone') || id.includes('user-location') || id.includes('gps-accuracy'))) {
        return null;
    }
    if (typeof id === 'string' && id.includes('accident-hotspot')) {
        return addedSourceIds.has(id) ? { setData: mockSetData } : null;
    }
    return { setData: vi.fn() };
});
const mockSetFilter = vi.fn();
const mockSetPaintProperty = vi.fn();
const mockSetMaxZoom = vi.fn();
const mockEaseTo = vi.fn();
const mockFitBounds = vi.fn();
const mockFlyTo = vi.fn();
const mockOnCallbacks = {};
const mockAddControl = vi.fn();
const mockAddSource = vi.fn((id) => {
    addedSourceIds.add(id);
});
const mockAddLayer = vi.fn((layer) => {
    if (layer?.id) addedLayerIds.add(layer.id);
});
const mockRemove = vi.fn();

vi.mock('maplibre-gl', () => ({
    default: {
        supported: vi.fn(() => true),
        addProtocol: vi.fn(),
        Map: vi.fn(function (options) {
            this.options = options;
            this.setLayoutProperty = mockSetLayoutProperty;
            this.getLayer = mockGetLayer;
            this.getMaxZoom = vi.fn(() => 16);
            this.setFilter = mockSetFilter;
            this.setPaintProperty = mockSetPaintProperty;
            this.setMaxZoom = mockSetMaxZoom;
            this.getZoom = vi.fn(() => 11);
            this.easeTo = mockEaseTo;
            this.fitBounds = mockFitBounds;
            this.flyTo = mockFlyTo;
            this.addControl = mockAddControl;
            this.addSource = mockAddSource;
            this.addLayer = mockAddLayer;
            this.getSource = mockGetSource;
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
        FullscreenControl: mockFullscreenControl,
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
import {
    ACCIDENT_HOTSPOT_SOURCE_ID,
    accidentHotspotCircleLayerId,
} from '../config/accidentHotspots';

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

    test('puts map scope in the tool rail with the layer and location tools, and only when asked', async () => {
        const onMapScopeChange = vi.fn();
        render(<MapView reports={[]} mapScope="island" onMapScopeChange={onMapScopeChange} mapScopeMunicipality="Cajidiocan" />);

        await waitFor(() => expect(maplibregl.Map).toHaveBeenCalled());

        const rail = screen.getByRole('group', { name: 'Map tools' });
        const scopeButton = within(rail).getByRole('button', { name: 'Map scope: Entire Sibuyan Island' });
        // Same rail, same family: the scope control is a sibling of the tools the
        // map already had, not an overlay of its own.
        expect(within(rail).getByRole('button', { name: /switch to street map/i })).toBeInTheDocument();
        expect(within(rail).getByRole('button', { name: /reset map view/i })).toBeInTheDocument();
        expect(scopeButton).toHaveAttribute('aria-haspopup', 'dialog');
        expect(scopeButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('a map with one scope to draw gets no scope control', async () => {
        render(<MapView reports={[]} />);

        await waitFor(() => expect(maplibregl.Map).toHaveBeenCalled());

        const rail = screen.getByRole('group', { name: 'Map tools' });
        expect(within(rail).queryByRole('button', { name: /^Map scope:/ })).not.toBeInTheDocument();
    });
});

describe('MapView opening framing', () => {
    const visibleReports = [
        {
            _id: 'framing-south',
            status: 'verified',
            coordinates: { lat: 12.30, lng: 122.50 },
            incidentCategory: 'accident',
        },
        {
            _id: 'framing-north',
            status: 'verified',
            coordinates: { lat: 12.55, lng: 122.70 },
            incidentCategory: 'accident',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockMapInstances.length = 0;
        Object.keys(mockOnCallbacks).forEach((k) => delete mockOnCallbacks[k]);
        vi.stubEnv('VITE_3D_LABELS_PMTILES_URL', '');
        vi.stubEnv('VITE_PMTILES_URL', '');
        const bytes = createPmtilesHeader();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createRangeResponse(bytes)));
    });

    const renderReady = async (props, existingView) => {
        // Re-rendering an already mounted map is how the tests below change a
        // prop the way the app does (a toggle), rather than remounting — a
        // remount would hide the very thing being asserted.
        const view = existingView ?? render(<MapView {...props} />);
        if (existingView) existingView.rerender(<MapView {...props} />);
        await waitFor(() => {
            expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        });
        // The map is only ready once MapLibre's load callback has fired, which is
        // when the interaction listeners and the framing effect run.
        await waitFor(() => {
            expect(mockOnCallbacks.load).toBeInstanceOf(Function);
        });
        return view;
    };

    const mappedZones = [
        {
            _id: 'zone-a',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            radius: 39,
            coordinates: { lat: 12.34, lng: 122.66 },
        },
        {
            _id: 'zone-b',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            radius: 47,
            coordinates: { lat: 12.35, lng: 122.67 },
        },
    ];

    const landslideLayer = {
        datasetId: 'landslide',
        hazardType: 'landslide',
        label: 'Landslide',
        shortLabel: 'Landslide',
        classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
        features: [
            { type: 'Feature', properties: { haz: 3 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
            { type: 'Feature', properties: { haz: 2 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
        ],
    };

    test('draws only the hazard classes switched on, on the layers already there', async () => {
        const view = await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
            hazardClassVisibility: { landslide: [2] },
        });

        // One class on: the layer is filtered to it, so the other class's
        // polygons are not drawn rather than drawn invisibly.
        await waitFor(() => {
            expect(mockSetFilter).toHaveBeenCalledWith(
                'hazard-landslide-fill',
                ['in', ['get', 'haz'], ['literal', [2]]]
            );
        });
        expect(mockSetFilter).toHaveBeenCalledWith(
            'hazard-landslide-outline',
            ['in', ['get', 'haz'], ['literal', [2]]]
        );

        // Both on re-filters those same layers. Nothing is rebuilt: no second
        // map, no second source — the geometry and colours are untouched.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
            hazardClassVisibility: { landslide: [2, 3] },
        }, view);

        await waitFor(() => {
            expect(mockSetFilter).toHaveBeenLastCalledWith(
                'hazard-landslide-outline',
                ['in', ['get', 'haz'], ['literal', [2, 3]]]
            );
        });
        expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        expect(mockAddSource).not.toHaveBeenCalledWith('hazard-landslide', expect.anything());

        // Nothing on is an empty selection, which must hide the layer rather
        // than fall back to drawing all of it.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
            hazardClassVisibility: { landslide: [] },
        }, view);

        await waitFor(() => {
            expect(mockSetFilter).toHaveBeenLastCalledWith(
                'hazard-landslide-outline',
                ['in', ['get', 'haz'], ['literal', []]]
            );
        });
        expect(mockSetFilter).toHaveBeenCalledWith(
            'hazard-landslide-fill',
            ['in', ['get', 'haz'], ['literal', []]]
        );
    });

    test('draws a hazard layer whole when its caller has no per-class control', async () => {
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
        });

        // `null` is "no control", which is the previous behaviour kept intact for
        // any map that is handed hazard layers and no switches of its own.
        await waitFor(() => {
            expect(mockSetFilter).toHaveBeenCalledWith('hazard-landslide-fill', null);
        });
    });

    test('draws the zones on a page whose whole subject is hazard zones', async () => {
        // The zones page says `mode="risk-zones"` and passes no filter tab. That
        // mode used to be invisible to this gate, which filtered the page's own
        // zones away and drew an empty map — on the one screen that exists to
        // show them.
        await renderReady({ highRiskZones: mappedZones, mode: 'risk-zones', showDataState: true });

        await waitFor(() => {
            expect(maplibregl.Marker).toHaveBeenCalledTimes(2);
        });
        // Two zones on the map, so the page must not claim it has nothing.
        expect(screen.queryByText(/no high-risk zones/i)).toBeNull();
    });

    test('keeps hazard zones off a map that is about incidents', async () => {
        // The dashboard states its subject with `filterStatus`, so zones stay out
        // of the incident map until the tab that means "show hazards" is chosen.
        await renderReady({
            reports: visibleReports,
            highRiskZones: mappedZones,
            showDataState: true,
        });

        // Two markers and no more: the two incidents, and neither zone.
        await waitFor(() => {
            expect(maplibregl.Marker).toHaveBeenCalledTimes(2);
        });
    });

    test('shows only the zone a target asked for, not the whole hazard layer', async () => {
        // A search result or a "Locate" hands this map ONE zone while the tab is
        // about incidents. Drawing a target used to turn the layer on, so
        // selecting a single hazard area drew every hazard area on the island —
        // under a tab whose label said something else entirely.
        await renderReady({
            reports: visibleReports,
            highRiskZones: mappedZones,
            locateRequest: {
                type: 'risk-zone',
                id: 'zone-b',
                entity: mappedZones[1],
                requestId: 'zone-target-1',
            },
            showDataState: true,
        });

        // Two incidents and exactly one zone: the one that was asked for.
        await waitFor(() => {
            expect(maplibregl.Marker).toHaveBeenCalledTimes(3);
        });
    });

    test('closes a hazard zone\u2019s details when the layer stops being drawn', async () => {
        const onEntityInspectorChange = vi.fn();
        const view = await renderReady({
            highRiskZones: mappedZones,
            filterStatus: 'risk-zones',
            onEntityInspectorChange,
            showDataState: true,
        });

        await waitFor(() => {
            expect(maplibregl.Marker).toHaveBeenCalledTimes(2);
        });

        // Open one zone's details the way a reader does: click its own marker.
        const zoneElement = maplibregl.Marker.mock.calls
            .map(([options]) => options?.element)
            .find((element) => element?.className === 'zone-marker');
        expect(zoneElement).toBeTruthy();
        fireEvent.click(zoneElement);

        await waitFor(() => {
            expect(onEntityInspectorChange).toHaveBeenCalledWith(true);
        });

        // Now the viewer leaves for a tab that does not draw hazards. The marker
        // that opened this pane is gone with the layer, so the pane must go too —
        // it would otherwise describe a marker that is no longer on the canvas.
        view.rerender(
            <MapView
                highRiskZones={mappedZones}
                filterStatus="pending"
                onEntityInspectorChange={onEntityInspectorChange}
                showDataState
            />,
        );

        await waitFor(() => {
            expect(onEntityInspectorChange).toHaveBeenLastCalledWith(false);
        });
    });

    test('tells the zones page that its zones are missing, not that incidents are', async () => {
        await renderReady({ highRiskZones: [], mode: 'risk-zones', showDataState: true });

        await waitFor(() => {
            expect(screen.getByText('No high-risk zones are mapped yet.')).toBeTruthy();
        });
        // An empty zones page must never talk about incidents: it never draws one.
        expect(screen.queryByText(/no active incidents/i)).toBeNull();
    });

    test('does not call an empty map empty while its zones are still loading', async () => {
        const view = await renderReady({
            highRiskZones: [],
            mode: 'risk-zones',
            showDataState: true,
            dataLoading: true,
        });

        // "Nothing is mapped" and "not here yet" are the same picture and not the
        // same fact, so the claim waits for the request to finish.
        expect(screen.queryByText('No high-risk zones are mapped yet.')).toBeNull();

        view.rerender(
            <MapView highRiskZones={[]} mode="risk-zones" showDataState dataLoading={false} />
        );

        await waitFor(() => {
            expect(screen.getByText('No high-risk zones are mapped yet.')).toBeTruthy();
        });
    });

    test('names the filter when the dashboard risk-zones tab has no matches', async () => {
        await renderReady({ highRiskZones: [], filterStatus: 'risk-zones', showDataState: true });

        await waitFor(() => {
            expect(screen.getByText('No high-risk zones match the selected filter.')).toBeTruthy();
        });
    });

    test('keeps the incident wording on a map that draws incidents', async () => {
        await renderReady({ reports: [], showDataState: true });

        await waitFor(() => {
            expect(screen.getByText('No active incidents are currently visible.')).toBeTruthy();
        });
    });

    test('opens on the incidents the viewer can see, not on open water', async () => {
        await renderReady({ reports: visibleReports, frameReportsOnOpen: true });

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(1);
        });
        const [bounds, options] = mockFitBounds.mock.calls[0];
        expect(bounds).toEqual([[122.50, 12.30], [122.70, 12.55]]);
        // Capped, so a lone incident frames its surroundings instead of resolving
        // to street level, and instant, because an opening view is not a move.
        expect(options).toMatchObject({ maxZoom: 13, duration: 0 });
        expect(options.padding).toBeTruthy();
    });

    test('keeps the island view when the viewer has no incidents to frame', async () => {
        await renderReady({ reports: [], frameReportsOnOpen: true });

        // The centre set at construction is the fallback; nothing may move it.
        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(maplibregl.Map.mock.calls[0][0].center).toEqual([122.5571, 12.4176]);
    });

    test('leaves maps that do not ask for framing alone', async () => {
        // Previews and the analytics map set their own camera from a single
        // entity or a date slice; framing them on the report list would fight it.
        await renderReady({ reports: visibleReports });

        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('never takes the camera back from a viewer who already moved it', async () => {
        const view = await renderReady({ reports: [], frameReportsOnOpen: true });

        // A gesture with an originating DOM event is a person's input.
        mockOnCallbacks.dragstart({ originalEvent: { type: 'pointerdown' } });

        // Incidents arrive afterwards — a slow API, or a refresh. The camera the
        // viewer chose stands.
        view.rerender(<MapView reports={visibleReports} frameReportsOnOpen />);

        await waitFor(() => {
            expect(maplibregl.Marker).toHaveBeenCalled();
        });
        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('ignores camera moves the map makes by itself', async () => {
        // Programmatic moves fire the same gesture events without an
        // originating DOM event, so they must not count as the viewer's input.
        await renderReady({ reports: [], frameReportsOnOpen: true });

        mockOnCallbacks.zoomstart({});
        mockOnCallbacks.zoomstart({ originalEvent: null });

        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(maplibregl.Map).toHaveBeenCalledTimes(1);
    });

    test('sends Reset map view back to the same framing the map opened with', async () => {
        await renderReady({ reports: visibleReports, frameReportsOnOpen: true });

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /reset map view/i }));

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(2);
        });
        // Same bounds as the opening view, so "reset" and "default" cannot drift.
        expect(mockFitBounds.mock.calls[1][0]).toEqual(mockFitBounds.mock.calls[0][0]);
        expect(mockEaseTo).not.toHaveBeenCalled();
    });

    test('falls back to the island when Reset has nothing to frame', async () => {
        await renderReady({ reports: [], frameReportsOnOpen: true });

        fireEvent.click(screen.getByRole('button', { name: /reset map view/i }));

        // No incidents on this map, so the button returns to the whole island.
        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('sends Reset to the island on a map that opens on the island', async () => {
        // A guest map has incidents on it and still opens on the island, so Reset
        // has to read the same flag the opening view did — otherwise the reset
        // control would be the one place a guest gets cropped onto the incidents.
        await renderReady({ reports: visibleReports, frameReportsOnOpen: false });

        fireEvent.click(screen.getByRole('button', { name: /reset map view/i }));

        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [122.5571, 12.4176],
        }));
    });

    // The viewer's assignment, resolved by the caller's RBAC scope (dashboard:
    // MUNICIPALITY_MAP_FOCUS). It is the map's resting camera, not a link target.
    const HOME_FOCUS = { lat: 12.4044, lng: 122.6897, zoom: 12 };
    // The dashboard's island-wide map scope: a level above the admin's own
    // municipality, and a camera that is a place rather than the reports.
    const ISLAND_FOCUS = { lat: 12.425, lng: 122.575, zoom: 10 };
    const REPORT_BOUNDS = [[122.50, 12.30], [122.70, 12.55]];

    test('rests on the viewer\'s own camera when there is nothing to frame', async () => {
        await renderReady({ reports: [], frameReportsOnOpen: true, homeFocus: HOME_FOCUS });

        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [HOME_FOCUS.lng, HOME_FOCUS.lat],
            zoom: HOME_FOCUS.zoom,
            duration: 0,
        }));
    });

    test('leaves a viewer with no assignment and nothing to frame on the island', async () => {
        // A guest: no municipality to rest on and no incident framing. The centre
        // set at construction is the only camera left, and nothing may move it.
        await renderReady({ reports: [], frameReportsOnOpen: false, homeFocus: null });

        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(mockFlyTo).not.toHaveBeenCalled();
    });

    test('opens on the same camera whether the reports were cached or arrived late', async () => {
        // Cold: the map is up before its data is, so there is nothing to frame and
        // no answer yet. It waits on the island instead of taking the home camera
        // and being pulled off it a moment later.
        const cold = await renderReady({
            reports: [],
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            dataLoading: true,
        });
        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(mockFlyTo).not.toHaveBeenCalled();

        cold.rerender(
            <MapView reports={visibleReports} frameReportsOnOpen homeFocus={HOME_FOCUS} dataLoading={false} />
        );

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(1);
        });
        expect(mockFitBounds.mock.calls[0][0]).toEqual(REPORT_BOUNDS);
        // Same camera a viewer with a warm cache opens on — the incidents — which
        // is what makes "the default" one view instead of two.
        expect(mockFlyTo).not.toHaveBeenCalled();
    });

    test('opens on the incidents, not the municipality, when the reports were cached', async () => {
        await renderReady({
            reports: visibleReports,
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            dataLoading: false,
        });

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(1);
        });
        expect(mockFitBounds.mock.calls[0][0]).toEqual(REPORT_BOUNDS);
        // The home camera used to win this race on a warm cache and lose it on a
        // cold one; it must not compete with the incidents at all.
        expect(mockFlyTo).not.toHaveBeenCalled();
    });

    test('leaves the camera to an explicit deep link', async () => {
        await renderReady({
            reports: visibleReports,
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            locateRequest: {
                type: 'incident',
                id: 'framing-south',
                entity: visibleReports[0],
                requestId: 'deep-link-1',
            },
        });

        // A link asked for one incident. Framing the whole set underneath it would
        // move the camera the viewer was sent to.
        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('sends Reset to the viewer\'s own camera when there is nothing to frame', async () => {
        await renderReady({ reports: [], frameReportsOnOpen: true, homeFocus: HOME_FOCUS });
        mockFlyTo.mockClear();

        fireEvent.click(screen.getByRole('button', { name: /reset map view/i }));

        expect(mockFitBounds).not.toHaveBeenCalled();
        expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [HOME_FOCUS.lng, HOME_FOCUS.lat],
        }));
        // Not the island: this map does not open there, so Reset must not either.
        expect(mockFlyTo).not.toHaveBeenCalledWith(expect.objectContaining({ center: [122.5571, 12.4176] }));
    });

    test('re-aims an island scope at the island in one animated move', async () => {
        const view = await renderReady({
            reports: visibleReports,
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            homeFocusRequestId: 'municipality:Cajidiocan',
            dataLoading: false,
        });
        mockFlyTo.mockClear();
        mockFitBounds.mockClear();

        view.rerender(
            <MapView
                reports={visibleReports}
                frameReportsOnOpen={false}
                homeFocus={ISLAND_FOCUS}
                homeFocusRequestId="island:Cajidiocan"
                dataLoading={false}
            />
        );

        await waitFor(() => {
            expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
                center: [ISLAND_FOCUS.lng, ISLAND_FOCUS.lat],
                zoom: ISLAND_FOCUS.zoom,
            }));
        });
        // One move, and animated: the viewer asked to be taken to the island, so
        // the switch reads as a move between two scopes rather than as a snap.
        expect(mockFlyTo).toHaveBeenCalledTimes(1);
        expect(mockFlyTo.mock.calls[0][0].duration).toBeGreaterThan(0);
        // Island scope draws the island, not the incidents inside it. Framing them
        // would land the switch on the municipality it just left whenever the
        // island's incidents happen to sit in one place.
        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('holds the island switch until the island\'s data is in', async () => {
        const view = await renderReady({
            reports: visibleReports,
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            homeFocusRequestId: 'municipality:Cajidiocan',
            dataLoading: false,
        });
        mockFlyTo.mockClear();

        view.rerender(
            <MapView
                reports={visibleReports}
                frameReportsOnOpen={false}
                homeFocus={ISLAND_FOCUS}
                homeFocusRequestId="island:Cajidiocan"
                dataLoading
            />
        );

        // Spent under the loading veil, the move would be invisible — the viewer
        // would only see the view it arrived at, which is the jump being fixed.
        expect(mockFlyTo).not.toHaveBeenCalled();

        view.rerender(
            <MapView
                reports={visibleReports}
                frameReportsOnOpen={false}
                homeFocus={ISLAND_FOCUS}
                homeFocusRequestId="island:Cajidiocan"
                dataLoading={false}
            />
        );

        await waitFor(() => {
            expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
                center: [ISLAND_FOCUS.lng, ISLAND_FOCUS.lat],
                zoom: ISLAND_FOCUS.zoom,
            }));
        });
        expect(mockFlyTo).toHaveBeenCalledTimes(1);
        expect(mockFlyTo.mock.calls[0][0].duration).toBeGreaterThan(0);
    });

    test('lets a scope switch own an arrival that is still loading', async () => {
        // A viewer who switches scope before the first load settles. The opening
        // camera is instant (an opening view is not a move), so letting it land
        // first would snap the map somewhere the switch immediately leaves.
        const view = await renderReady({
            reports: [],
            frameReportsOnOpen: true,
            homeFocus: HOME_FOCUS,
            homeFocusRequestId: 'municipality:Cajidiocan',
            dataLoading: true,
        });
        mockFlyTo.mockClear();

        view.rerender(
            <MapView
                reports={visibleReports}
                frameReportsOnOpen={false}
                homeFocus={ISLAND_FOCUS}
                homeFocusRequestId="island:Cajidiocan"
                dataLoading={false}
            />
        );

        await waitFor(() => {
            expect(mockFlyTo).toHaveBeenCalled();
        });
        // One move, and it is the switch's.
        expect(mockFlyTo).toHaveBeenCalledTimes(1);
        expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({
            center: [ISLAND_FOCUS.lng, ISLAND_FOCUS.lat],
            zoom: ISLAND_FOCUS.zoom,
        }));
        expect(mockFlyTo.mock.calls[0][0].duration).toBeGreaterThan(0);
        expect(mockFitBounds).not.toHaveBeenCalled();
    });

    test('holds the municipality switch until the reports it frames are in', async () => {
        const view = await renderReady({
            reports: [],
            frameReportsOnOpen: false,
            homeFocus: ISLAND_FOCUS,
            homeFocusRequestId: 'island:Cajidiocan',
            dataLoading: false,
        });
        mockFitBounds.mockClear();

        view.rerender(
            <MapView
                reports={[]}
                frameReportsOnOpen
                homeFocus={HOME_FOCUS}
                homeFocusRequestId="municipality:Cajidiocan"
                dataLoading
            />
        );

        // Nothing to frame yet. Settling on the island the viewer just left and
        // being pulled off it a moment later is the one thing this wait prevents.
        expect(mockFitBounds).not.toHaveBeenCalled();

        view.rerender(
            <MapView
                reports={visibleReports}
                frameReportsOnOpen
                homeFocus={HOME_FOCUS}
                homeFocusRequestId="municipality:Cajidiocan"
                dataLoading={false}
            />
        );

        await waitFor(() => {
            expect(mockFitBounds).toHaveBeenCalledTimes(1);
        });
        // Same bounds the map opens on inside this municipality, so switching back
        // lands on the incidents rather than on the municipal centre.
        expect(mockFitBounds.mock.calls[0][0]).toEqual(REPORT_BOUNDS);
    });

    test('stands a pin\'s details in the box it was handed, not over the map', async () => {
        const dock = document.createElement('div');
        dock.setAttribute('data-testid', 'pin-dock');
        document.body.appendChild(dock);
        const onEntityInspectorChange = vi.fn();
        const pinnedReport = {
            _id: 'pin-report',
            status: 'verified',
            coordinates: { lat: 12.40, lng: 122.60 },
            incidentCategory: 'accident',
        };

        await renderReady({
            reports: [pinnedReport],
            dockTarget: dock,
            onEntityInspectorChange,
        });

        await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalled());
        // The pin the map drew, clicked the way a reader clicks it.
        fireEvent.click(maplibregl.Marker.mock.calls.at(-1)[0].element);

        const dialog = await screen.findByRole('dialog', { name: 'Incident details' });
        // In the box it was given — the caller's summary column — and not in the
        // map container, which is what "over the map" means. No sheet and no
        // percentage width either: both were the overlay this pane used to be.
        expect(dock).toContainElement(dialog);
        expect(dialog).toHaveClass('pane-enter', 'flex-1');
        expect(dialog.className).not.toContain('fixed');
        expect(dialog.className).not.toContain('sm:w-[min(24rem,42%)]');
        // The tone of the record it is showing, on the pane's own leading edge.
        expect(dialog.firstElementChild).toHaveClass('bg-blue-500', 'h-[2px]');
        // And the caller is told the box is in use, so it can stand its own pane
        // down instead of sharing it.
        expect(onEntityInspectorChange).toHaveBeenLastCalledWith(true);

        fireEvent.click(within(dialog).getByRole('button', { name: 'Close incident details' }));

        expect(onEntityInspectorChange).toHaveBeenLastCalledWith(false);
        expect(dock).toBeEmptyDOMElement();
        dock.remove();
    });

    test('a pin\'s own panel offers Acknowledge transfer when its caller grants it', async () => {
        const onAcknowledgeTransferToReport = vi.fn(async () => ({ ok: true, message: 'Transfer acknowledged' }));
        const transferredReport = {
            _id: 'pin-transfer',
            status: 'transferred',
            municipalityName: 'Magdiwang',
            coordinates: { lat: 12.40, lng: 122.60 },
            incidentCategory: 'accident',
            transferHistory: [{ fromMunicipalityName: 'Cajidiocan', toMunicipalityName: 'Magdiwang', acknowledgedAt: null }],
        };

        await renderReady({
            reports: [transferredReport],
            canAcknowledgeTransfer: true,
            canAcknowledgeTransferReport: (report) => report?.status === 'transferred',
            onAcknowledgeTransferToReport,
        });

        await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalled());
        // Which surface opened the incident must not decide what its reader may do
        // about it: the pin's panel carries the same verb as the workspace's.
        fireEvent.click(maplibregl.Marker.mock.calls.at(-1)[0].element);

        const dialog = await screen.findByRole('dialog', { name: 'Incident details' });
        fireEvent.click(within(dialog).getByRole('button', { name: /Acknowledge transfer/i }));

        await waitFor(() => expect(onAcknowledgeTransferToReport).toHaveBeenCalledTimes(1));
        expect(onAcknowledgeTransferToReport.mock.calls[0][0]).toMatchObject({ _id: 'pin-transfer' });
    });
});

describe('MapView accident-prone circles', () => {
    const RULE = { radiusMeters: 100, windowDays: 30, mediumMinReports: 3, highMinReports: 6 };

    const hotspotLayer = (features, rule = RULE) => ({
        datasetId: 'accident_hotspots',
        label: 'Accident-prone',
        source: 'Sibuyan Alert accident reports',
        derivedFromReports: true,
        method: 'radius_cluster',
        rule,
        classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
        features,
    });

    const point = (hazardClass, count, coordinates) => ({
        type: 'Feature',
        properties: { class: hazardClass, count },
        geometry: { type: 'Point', coordinates },
    });

    const mediumCell = point(2, 3, [122.676219, 12.345053]);
    const highCell = point(3, 6, [122.55, 12.4]);
    const layerWithBoth = (rule) => hotspotLayer([mediumCell, highCell], rule);

    beforeEach(() => {
        vi.clearAllMocks();
        mockMapInstances.length = 0;
        addedLayerIds.clear();
        addedSourceIds.clear();
        Object.keys(mockOnCallbacks).forEach((k) => delete mockOnCallbacks[k]);
        vi.stubEnv('VITE_3D_LABELS_PMTILES_URL', '');
        vi.stubEnv('VITE_PMTILES_URL', '');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createRangeResponse(createPmtilesHeader())));
    });

    const renderReady = async (props, existingView) => {
        const view = existingView ?? render(<MapView {...props} />);
        if (existingView) existingView.rerender(<MapView {...props} />);
        await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockOnCallbacks.load).toBeInstanceOf(Function));
        return view;
    };

    const addedLayer = (layerId) => mockAddLayer.mock.calls
        .map(([layer]) => layer)
        .find((layer) => layer?.id === layerId);

    const circleLayerId = (classValue) => accidentHotspotCircleLayerId(classValue);

    test('adds one shared source and one circle layer per class, both off', async () => {
        await renderReady({ reports: [], mode: 'risk-zones', accidentHotspots: layerWithBoth() });

        // One source for both classes: a point is not duplicated per class, and
        // each layer selects its own class with a filter.
        expect(mockAddSource).toHaveBeenCalledWith(ACCIDENT_HOTSPOT_SOURCE_ID, expect.objectContaining({
            type: 'geojson',
        }));
        expect(mockAddSource.mock.calls.filter(([id]) => id === ACCIDENT_HOTSPOT_SOURCE_ID)).toHaveLength(1);

        const medium = addedLayer(circleLayerId(2));
        const high = addedLayer(circleLayerId(3));
        expect(medium).toMatchObject({
            type: 'circle',
            source: ACCIDENT_HOTSPOT_SOURCE_ID,
            filter: ['==', ['get', 'class'], 2],
            // The default state of the layer is off, on the map itself.
            layout: { visibility: 'none' },
        });
        expect(high).toMatchObject({
            filter: ['==', ['get', 'class'], 3],
            layout: { visibility: 'none' },
        });

        // Intensity separates the two classes, not size: both circles are the
        // same 100 m analysis area, so a bigger medium dot would misstate where
        // the hotspot ends.
        expect(high.paint['circle-radius']).toEqual(medium.paint['circle-radius']);
        expect(high.paint['circle-opacity']).toBeGreaterThan(medium.paint['circle-opacity']);

        // The radius is the rule drawn to scale: a Mercator ramp clamped to a
        // legible minimum, not a fixed pixel size and not the report count.
        expect(medium.paint['circle-radius'][0]).toBe('max');
        expect(medium.paint['circle-radius'][1]).toMatchObject({ 0: 'interpolate' });
        expect(medium.paint['circle-radius'][1][1]).toEqual(['exponential', 2]);
    });

    test('switches each class by visibility alone, without rebuilding the map', async () => {
        const view = await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [],
        });

        expect(mockSetLayoutProperty).not.toHaveBeenCalledWith(circleLayerId(2), 'visibility', 'visible');

        // Medium alone.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [2],
        }, view);

        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith(circleLayerId(2), 'visibility', 'visible');
        });
        expect(mockSetLayoutProperty).toHaveBeenCalledWith(circleLayerId(3), 'visibility', 'none');

        // Both, and then the clean map again — each toggle must leave the other
        // class exactly as it was.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [2, 3],
        }, view);
        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith(circleLayerId(3), 'visibility', 'visible');
        });

        await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [],
        }, view);
        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenLastCalledWith(circleLayerId(3), 'visibility', 'none');
        });

        // Nothing was re-created: one map, one source, two layers, and the data
        // itself is only ever handed over through setData.
        expect(maplibregl.Map).toHaveBeenCalledTimes(1);
        expect(mockAddSource.mock.calls.filter(([id]) => id === ACCIDENT_HOTSPOT_SOURCE_ID)).toHaveLength(1);
        expect(mockAddLayer.mock.calls.filter(([layer]) => layer?.id === circleLayerId(2))).toHaveLength(1);
        expect(mockSetData).toHaveBeenCalledWith(expect.objectContaining({ type: 'FeatureCollection' }));
    });

    test('draws the radius the server rule states, and not one of its own', async () => {
        const view = await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth(),
        });

        const firstRadius = addedLayer(circleLayerId(2)).paint['circle-radius'];
        expect(firstRadius[1].slice(3)).toEqual([10, expect.any(Number), 13, expect.any(Number), 16, expect.any(Number)]);

        // Retuning the analysis on the server widens the circle without a reload:
        // the paint is rewritten, and nothing is re-created.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth({ ...RULE, radiusMeters: 250 }),
        }, view);

        await waitFor(() => {
            expect(mockSetPaintProperty).toHaveBeenCalledWith(
                circleLayerId(2),
                'circle-radius',
                expect.anything()
            );
        });
        const repainted = mockSetPaintProperty.mock.calls.at(-1)[2];
        // Same zoom stops, a wider circle at each of them.
        expect(repainted[1].slice(3)).toEqual([10, expect.any(Number), 13, expect.any(Number), 16, expect.any(Number)]);
        expect(repainted[1].slice(3)).not.toEqual(firstRadius[1].slice(3));
        expect(mockAddLayer.mock.calls.filter(([layer]) => layer?.id === circleLayerId(2))).toHaveLength(1);
        expect(maplibregl.Map).toHaveBeenCalledTimes(1);

        // An unchanged rule is not repainted on every render — a needless paint
        // write restarts MapLibre's transition each time the data refreshes.
        mockSetPaintProperty.mockClear();
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            accidentHotspots: layerWithBoth({ ...RULE, radiusMeters: 250 }),
        }, view);
        expect(mockSetPaintProperty).not.toHaveBeenCalled();
    });

    test('draws nothing for a map that was handed no accident layer', async () => {
        await renderReady({ reports: [], mode: 'risk-zones' });

        expect(mockAddSource).not.toHaveBeenCalledWith(ACCIDENT_HOTSPOT_SOURCE_ID, expect.anything());
        expect(addedLayer(circleLayerId(2))).toBeUndefined();
    });

    test('stays off on a map whose subject is not risk zones', async () => {
        // Same rule as the hazard layers: mapped hazards belong to the workspace
        // that draws them, so an incident map cannot inherit them by accident.
        await renderReady({
            reports: [],
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [2, 3],
        });

        expect(addedLayer(circleLayerId(2)).layout).toEqual({ visibility: 'none' });
        expect(addedLayer(circleLayerId(3)).layout).toEqual({ visibility: 'none' });
    });

    test('leaves the susceptibility layers untouched while it draws', async () => {
        const landslideLayer = {
            datasetId: 'landslide',
            hazardType: 'landslide',
            label: 'Landslide',
            classes: [{ value: 2, label: 'Medium' }, { value: 3, label: 'High' }],
            features: [
                { type: 'Feature', properties: { haz: 2 }, geometry: { type: 'MultiPolygon', coordinates: [] } },
            ],
        };

        const view = await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
            hazardClassVisibility: { landslide: [2] },
            accidentHotspots: layerWithBoth(),
        });

        await waitFor(() => {
            expect(mockSetFilter).toHaveBeenCalledWith('hazard-landslide-fill', ['in', ['get', 'haz'], ['literal', [2]]]);
        });

        // Switching an accident class on must not disturb the susceptibility
        // layer's own class selection — the two controls are independent.
        await renderReady({
            reports: [],
            mode: 'risk-zones',
            hazardLayers: [landslideLayer],
            hazardClassVisibility: { landslide: [2] },
            accidentHotspots: layerWithBoth(),
            accidentHotspotClasses: [2],
        }, view);

        await waitFor(() => {
            expect(mockSetLayoutProperty).toHaveBeenCalledWith(circleLayerId(2), 'visibility', 'visible');
        });
        expect(mockSetFilter).toHaveBeenLastCalledWith('hazard-landslide-outline', ['in', ['get', 'haz'], ['literal', [2]]]);
        expect(mockSetLayoutProperty).not.toHaveBeenCalledWith('hazard-landslide-fill', 'visibility', 'none');
    });

    test('installs the fullscreen button for a map that asked to own the screen', async () => {
        // The zones workspace is the map that *is* the page, so it asks for the
        // expand control MapLibre already ships rather than growing one of its
        // own. It stacks under the navigation control, in the corner the map
        // already uses for camera actions.
        await renderReady({ reports: [], mode: 'risk-zones', showFullscreenControl: true });

        expect(mockFullscreenControl).toHaveBeenCalledTimes(1);
        expect(mockAddControl).toHaveBeenCalledWith(mockFullscreenControl.mock.instances[0], 'top-right');
    });

    test('leaves the fullscreen button off the maps that did not ask', async () => {
        // Most maps here are a card, a preview or a thumbnail, and expanding one
        // of those is not an action anyone wants. The default is what keeps them
        // as they were.
        await renderReady({ reports: [], mode: 'risk-zones' });

        expect(mockFullscreenControl).not.toHaveBeenCalled();
    });

    test('expands the caller\u2019s wrapper when one is given', async () => {
        // Fullscreen expands one element; anything outside it stays on the page.
        // A caller whose map has a header of its own passes that wrapper, so the
        // header's controls are inside the fullscreen element rather than left
        // behind on a page the user can no longer see.
        const wrapper = document.createElement('section');
        const wrapperRef = { current: wrapper };

        await renderReady({
            reports: [],
            mode: 'risk-zones',
            showFullscreenControl: true,
            fullscreenContainerRef: wrapperRef,
        });

        expect(mockFullscreenControl).toHaveBeenCalledTimes(1);
        expect(mockFullscreenControl.mock.calls[0][0]).toEqual({ container: wrapper });
    });

    test('expands the map itself when the caller has no wrapper', async () => {
        // The default is MapLibre's own behaviour, and most maps here are a card
        // or a preview with nothing around them to carry along.
        await renderReady({ reports: [], mode: 'risk-zones', showFullscreenControl: true });

        expect(mockFullscreenControl).toHaveBeenCalledTimes(1);
        expect(mockFullscreenControl.mock.calls[0][0]).toBeUndefined();
    });
});
