import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from '../router';

const { mapPropsSpy } = vi.hoisted(() => ({ mapPropsSpy: vi.fn() }));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapPropsSpy(props);
        return <div data-testid="map-view" />;
    },
}));

import DashboardMapWorkspace from '../components/dashboard/DashboardMapWorkspace';

const createProps = (overrides = {}) => ({
    user: { _id: 'user-1', role: 'reporter', name: 'Reporter' },
    isAuthenticated: true,
    isAdmin: false,
    isResponder: false,
    isReporter: true,
    loading: false,
    error: '',
    reports: [],
    pendingReports: [],
    respondingReports: [],
    resolvedTodayReports: [],
    highRiskZones: [],
    roleStats: { myReports: { pending: 1, verified: 2, resolved: 3 }, trustPoints: 10 },
    focusLocation: null,
    focusedReport: null,
    focusedRiskZone: null,
    responderMapFilter: 'all',
    setResponderMapFilter: vi.fn(),
    canCurrentResponderResolve: vi.fn(() => true),
    handleMapRespond: vi.fn(),
    handleMapResolve: vi.fn(),
    setSearchParams: vi.fn(),
    mapSummaryPanel: '',
    setMapSummaryPanel: vi.fn(),
    showMapPendingModal: false,
    setShowMapPendingModal: vi.fn(),
    showMapRespondingModal: false,
    setShowMapRespondingModal: vi.fn(),
    showMapResolvedModal: false,
    setShowMapResolvedModal: vi.fn(),
    activePanel: null,
    ...overrides,
});

const renderWorkspace = (props) => render(
    <MemoryRouter>
        <DashboardMapWorkspace {...props} />
    </MemoryRouter>
);

describe('DashboardMapWorkspace permissions', () => {
    beforeEach(() => mapPropsSpy.mockClear());

    test('keeps claim and resolve actions disabled for administrators', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
        }));

        const mapProps = mapPropsSpy.mock.lastCall[0];
        expect(mapProps.canRespond).toBe(false);
        expect(mapProps.canResolve).toBe(false);
        expect(mapProps.onRespondToReport).toBeNull();
        expect(mapProps.onResolveReport).toBeNull();
    });

    test('uses the shared square mobile map frame for every dashboard role', () => {
        renderWorkspace(createProps());

        expect(screen.getByTestId('map-view').parentElement).toHaveClass(
            'aspect-square',
            'w-full',
            'sm:aspect-auto',
        );
    });

    test('keeps primary map actions above the map and moves the four-card summary below it', () => {
        renderWorkspace(createProps());

        const incidentsAction = screen.getByRole('button', { name: /^incidents$/i });
        const riskZonesAction = screen.getByRole('button', { name: /^risk zones$/i });
        const liveMap = screen.getByRole('region', { name: 'Live incident map' });
        const summary = screen.getByRole('region', { name: 'Map summary' });

        expect(incidentsAction.parentElement).toHaveClass('grid', 'grid-cols-2', 'lg:flex');
        expect(incidentsAction).toHaveClass('w-full', 'min-w-0', 'lg:w-auto');
        expect(riskZonesAction).toHaveClass('w-full', 'min-w-0', 'lg:w-auto');
        expect(incidentsAction.compareDocumentPosition(liveMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(riskZonesAction.compareDocumentPosition(liveMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(liveMap.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test('uses one lightweight overview strip instead of four heavy cards', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });
        const cards = Array.from(summary.lastElementChild.children);

        expect(cards).toHaveLength(4);
        expect(summary.lastElementChild).toHaveClass('border-y', 'bg-white');
        cards.forEach((card) => {
            expect(card).not.toHaveClass('bg-gray-100', 'rounded-xl', 'shadow-sm');
        });
        expect(cards[0]).not.toHaveClass('border-l', 'border-t');
        expect(cards[1]).toHaveClass('border-l');
        expect(cards[2]).toHaveClass('border-t', 'lg:border-l');
    });

    test('enables claim and resolve actions only for responders', () => {
        const props = createProps({
            user: { _id: 'responder-1', role: 'responder', agency: 'BFP', assignedMunicipality: 'Magdiwang' },
            isResponder: true,
            isReporter: false,
        });
        renderWorkspace(props);

        const mapProps = mapPropsSpy.mock.lastCall[0];
        expect(mapProps.canRespond).toBe(true);
        expect(mapProps.canResolve).toBe(true);
        expect(mapProps.onRespondToReport).toBe(props.handleMapRespond);
        expect(mapProps.onResolveReport).toBe(props.handleMapResolve);
        expect(mapProps.canResolveReport).toBe(props.canCurrentResponderResolve);
        expect(mapProps.filterMode).toBe('response');
        expect(screen.getByRole('button', { name: 'Awaiting response' })).toBeInTheDocument();
    });

    test('gives administrators review terminology without responder actions', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
        }));

        expect(screen.getByText('Municipal oversight')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Needs review' })).toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            filterMode: 'review',
            canRespond: false,
            canResolve: false,
            showPending: true,
        });
    });

    test('converts a selected watchlist zone into the shared entity-focus request', () => {
        const focusedRiskZone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            coordinates: { lat: 12.4, lng: 122.6 },
        };

        renderWorkspace(createProps({
            highRiskZones: [focusedRiskZone],
            focusedRiskZone,
        }));

        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual({
            type: 'risk-zone',
            id: 'zone-1',
            entity: focusedRiskZone,
            requestId: 'risk-zone:zone-1',
        });
        expect(mapPropsSpy.mock.lastCall[0].focusedRiskZone).toBeUndefined();
    });

    test('converts a cross-page incident ID selection into the same focus request', () => {
        const focusedReport = {
            _id: 'report-1',
            coordinates: { lat: 12.4044, lng: 122.6897 },
        };

        renderWorkspace(createProps({
            reports: [focusedReport],
            focusedReport,
        }));

        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual({
            type: 'incident',
            id: 'report-1',
            entity: focusedReport,
            requestId: 'incident:report-1',
        });
    });

    test('shows reporter actions and all active lifecycle states in the incident list', () => {
        const setMapSummaryPanel = vi.fn();
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: new Date().toISOString() },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'motorcycle', coordinates: { lat: 12.5, lng: 122.7 }, createdAt: new Date().toISOString() },
            { _id: 'responding-1', status: 'responding', incidentType: 'pedestrian', coordinates: { lat: 12.6, lng: 122.8 }, createdAt: new Date().toISOString() },
        ];
        renderWorkspace(createProps({ reports, mapSummaryPanel: 'incidents', setMapSummaryPanel }));

        expect(screen.getByRole('link', { name: /submit report/i })).toHaveAttribute('href', '/report');
        expect(screen.getByText(/Vehicular/i)).toHaveTextContent(/Vehicular.*Verified/i);
        expect(screen.getByText(/Motorcycle/i)).toHaveTextContent(/Motorcycle.*Transferred/i);
        expect(screen.getByText(/Pedestrian/i)).toHaveTextContent(/Pedestrian.*Responding/i);

        fireEvent.click(screen.getByRole('button', { name: /^incidents$/i }));
        expect(setMapSummaryPanel).toHaveBeenCalledWith('incidents');
    });

    test('keeps the guest map public and free of operational controls', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            roleStats: null,
        }));

        expect(screen.getByText('Public safety map')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Awaiting response' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Needs review' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /submit report/i })).not.toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            viewerRole: 'guest',
            filterMode: 'public',
            showPending: false,
            showDataState: true,
            canRespond: false,
            canResolve: false,
        });
    });

    test('opens the same sanitized incident description from the guest active-incidents list', () => {
        const setMapSummaryPanel = vi.fn();
        const report = {
            _id: 'verified-guest-1',
            status: 'verified',
            title: 'Accident at J. Rizal Street',
            description: 'One lane is temporarily obstructed.',
            incidentType: 'vehicular',
            severity: 'moderate',
            address: 'J. Rizal Street',
            barangay: 'Poblacion',
            municipalityName: 'Cajidiocan',
            coordinates: { lat: 12.4, lng: 122.6 },
            incidentTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports: [report],
            mapSummaryPanel: 'incidents',
            setMapSummaryPanel,
        }));

        const listPanel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(screen.getByText('1 currently active')).toBeInTheDocument();
        expect(listPanel).toHaveClass('pointer-events-auto', 'sm:w-[min(24rem,42%)]');
        expect(listPanel.closest('[aria-label="Live incident map"]')).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'View details' }));

        expect(screen.getByRole('dialog', { name: 'Incident details' })).toHaveClass('sm:w-[min(24rem,42%)]');
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(report.description)).toBeInTheDocument();
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back to active incidents' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close incidents panel' }));
        expect(setMapSummaryPanel).toHaveBeenCalledWith('');
    });

    test('explains when active incidents share fewer marker locations', () => {
        const reports = [
            { _id: 'verified-1', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-2', status: 'verified', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'transferred-1', status: 'transferred', coordinates: { lat: 12.5, lng: 122.7 } },
            { _id: 'responding-1', status: 'responding', coordinates: { lat: 12.6, lng: 122.8 } },
        ];

        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports,
        }));

        expect(screen.getByRole('button', { name: /Active incidents 4 Across 3 map locations/i })).toBeInTheDocument();
    });

    test('locates an incident through the mounted map without URL navigation', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const scrollIntoView = vi.fn();
        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            reports: [report],
            mapSummaryPanel: 'incidents',
            setSearchParams,
            setMapSummaryPanel,
        }));

        fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

        expect(setSearchParams).not.toHaveBeenCalled();
        expect(setMapSummaryPanel).toHaveBeenCalledWith('');
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual(expect.objectContaining({
            type: 'incident',
            id: 'verified-1',
            entity: report,
            requestId: expect.stringMatching(/^\d+-1$/),
        }));
    });

    test('creates a new focus request for repeated locate clicks', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            reports: [report],
            mapSummaryPanel: 'incidents',
            setSearchParams,
            setMapSummaryPanel,
        }));

        const locateButton = screen.getByRole('button', { name: /^locate$/i });
        fireEvent.click(locateButton);
        const firstFocus = mapPropsSpy.mock.lastCall[0].locateRequest.requestId;
        fireEvent.click(locateButton);

        const secondFocus = mapPropsSpy.mock.lastCall[0].locateRequest.requestId;
        expect(setSearchParams).not.toHaveBeenCalled();
        expect(firstFocus).not.toBe(secondFocus);
    });

    test('switches summary modes in the same non-modal map panel with neutral selected controls', () => {
        const report = {
            _id: 'verified-1',
            status: 'verified',
            address: 'Near Cambijang',
            incidentType: 'vehicular',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            address: 'Sibuyan Circumferential Road, Cambijang',
            municipality: 'Cajidiocan',
            radius: 100,
            coordinates: { lat: 12.405, lng: 122.69 },
        };
        const props = createProps({ reports: [report], highRiskZones: [zone] });
        const { rerender } = renderWorkspace({ ...props, mapSummaryPanel: 'incidents' });

        const incidentControl = screen.getByRole('button', { name: 'Incidents' });
        const riskZoneControl = screen.getByRole('button', { name: 'Risk zones' });
        const panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(incidentControl).toHaveAttribute('aria-pressed', 'true');
        expect(riskZoneControl).toHaveAttribute('aria-pressed', 'false');
        expect(panel.parentElement).not.toHaveClass('fixed', 'bg-black/45', 'backdrop-blur-sm');

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="zones" />
            </MemoryRouter>,
        );

        expect(screen.getByRole('dialog', { name: 'High-risk zones' })).toBe(panel);
        expect(screen.getByText('1 monitored zone')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Incidents' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'Risk zones' })).toHaveAttribute('aria-pressed', 'true');
    });

    test('locates a risk zone using its real marker identity and closes the summary panel', () => {
        const setSearchParams = vi.fn();
        const setMapSummaryPanel = vi.fn();
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            address: 'Sibuyan Circumferential Road, Cambijang',
            municipality: 'Cajidiocan',
            radius: 100,
            coordinates: { lat: 12.405, lng: 122.69 },
        };

        renderWorkspace(createProps({
            highRiskZones: [zone],
            mapSummaryPanel: 'zones',
            setMapSummaryPanel,
            setSearchParams,
        }));

        fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

        expect(setSearchParams).not.toHaveBeenCalled();
        expect(setMapSummaryPanel).toHaveBeenCalledWith('');
        expect(mapPropsSpy.mock.lastCall[0].locateRequest).toEqual(expect.objectContaining({
            type: 'risk-zone',
            id: 'zone-1',
            entity: zone,
        }));
    });
});
