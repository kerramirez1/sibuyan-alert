import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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
const mockGetLayer = vi.fn((id) => {
    if (typeof id === 'string' && (id.includes('risk-zone') || id.includes('risk_zone') || id.includes('user-location') || id.includes('gps-accuracy'))) {
        return LOAD_ADDED_IDS.has(id) ? { id } : null;
    }
    return { id };
});
const mockGetSource = vi.fn((id) => {
    if (typeof id === 'string' && (id.includes('risk-zone') || id.includes('risk_zone') || id.includes('user-location') || id.includes('gps-accuracy'))) {
        return null;
    }
    return { setData: vi.fn() };
});
const mockSetMaxZoom = vi.fn();
const mockEaseTo = vi.fn();
const mockFitBounds = vi.fn();
const mockFlyTo = vi.fn();
const mockOnCallbacks = {};
const mockAddControl = vi.fn();
const mockAddSource = vi.fn();
const mockAddLayer = vi.fn();
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

    const renderReady = async (props) => {
        const view = render(<MapView {...props} />);
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
});
