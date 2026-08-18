import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    highRiskZonesLoading: false,
    highRiskZonesError: '',
    onRetryHighRiskZones: vi.fn(),
    roleStats: { myReports: { pending: 1, verified: 2, resolved: 3 }, trustPoints: 10 },
    reporterOverviewReports: null,
    reporterOverviewReportsLoading: false,
    reporterOverviewReportsError: '',
    onLoadReporterOverviewReports: vi.fn(),
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

    test('keeps the four-metric summary after the live map', () => {
        renderWorkspace(createProps());

        const liveMap = screen.getByRole('region', { name: 'Live incident map' });
        const summary = screen.getByRole('region', { name: 'Map summary' });
        const incidentsAction = within(summary).getByRole('button', { name: /View 0 active incidents/i });
        const riskZonesAction = within(summary).getByRole('button', { name: /View 0 risk zones/i });

        expect(liveMap.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(incidentsAction.parentElement).toHaveClass('grid', 'grid-cols-2', 'lg:grid-cols-4');
        expect(riskZonesAction).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
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
        expect(summary.lastElementChild).toHaveClass('grid', 'grid-cols-2', 'gap-px', 'lg:grid-cols-4');
        cards.forEach((card) => {
            expect(card).not.toHaveClass('bg-gray-100', 'rounded-xl', 'shadow-sm');
        });
        expect(cards.every((card) => card.tagName === 'BUTTON')).toBe(true);
    });

    test('renders every role-specific overview metric as a full semantic button', () => {
        const roleCases = [
            {
                user: null,
                isAuthenticated: false,
                isAdmin: false,
                isResponder: false,
                isReporter: false,
            },
            {
                user: { _id: 'reporter-1', role: 'reporter' },
                isAuthenticated: true,
                isAdmin: false,
                isResponder: false,
                isReporter: true,
            },
            {
                user: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
                isAuthenticated: true,
                isAdmin: false,
                isResponder: true,
                isReporter: false,
            },
            {
                user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
                isAuthenticated: true,
                isAdmin: true,
                isResponder: false,
                isReporter: false,
            },
        ];

        roleCases.forEach((roleProps) => {
            const { unmount } = renderWorkspace(createProps(roleProps));
            const metricButtons = within(screen.getByRole('region', { name: 'Map summary' })).getAllByRole('button');

            expect(metricButtons).toHaveLength(4);
            metricButtons.forEach((button) => {
                expect(button).toHaveAttribute('type', 'button');
                expect(button).toHaveAttribute('aria-controls', 'dashboard-map-summary-panel');
                expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-inset');
            });
            unmount();
        });
    });

    test('keeps municipal admin counts and contextual panel records on the same status definitions', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 }, createdAt: now },
            { _id: 'responding-1', status: 'responding', incidentType: 'marine', coordinates: { lat: 12.43, lng: 122.63 }, createdAt: now },
        ];
        const resolvedReport = { _id: 'resolved-1', status: 'resolved', incidentType: 'other', resolvedAt: now, createdAt: now };
        const props = createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            resolvedTodayReports: [resolvedReport],
            mapSummaryPanel: 'overview:admin-pending',
        });
        const { rerender } = renderWorkspace(props);

        const summary = screen.getByRole('region', { name: 'Map summary' });
        expect(within(summary).getByRole('button', { name: /View 1 pending\. Awaiting review/i })).toHaveAttribute('aria-pressed', 'true');
        let panel = screen.getByRole('dialog', { name: 'Pending incidents' });
        expect(within(panel).getByText(/Vehicular.*Pending/i)).toBeInTheDocument();
        expect(within(panel).queryByText(/Fire.*Verified/i)).not.toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:admin-dispatchable" />
            </MemoryRouter>,
        );
        panel = screen.getByRole('dialog', { name: 'Verified / transferred incidents' });
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(2);
        expect(within(panel).getByText(/Fire.*Verified/i)).toBeInTheDocument();
        expect(within(panel).getByText(/Medical.*Transferred/i)).toBeInTheDocument();
        expect(within(panel).queryByText(/Marine.*Responding/i)).not.toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:admin-responding" />
            </MemoryRouter>,
        );
        panel = screen.getByRole('dialog', { name: 'Responding incidents' });
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(1);
        expect(within(panel).getByText(/Marine.*Responding/i)).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:admin-resolved-today" />
            </MemoryRouter>,
        );
        panel = screen.getByRole('dialog', { name: 'Resolved today' });
        expect(within(panel).getByText(/Other.*Resolved/i)).toBeInTheDocument();
        expect(within(panel).queryByRole('button', { name: 'Locate' })).not.toBeInTheDocument();
    });



    test('opens zero-count metrics with a metric-specific empty state', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            mapSummaryPanel: 'overview:admin-pending',
        }));

        expect(screen.getByRole('button', { name: /View 0 pending\. Awaiting review/i })).toBeEnabled();
        expect(screen.getByRole('dialog', { name: 'Pending incidents' })).toHaveTextContent('No incidents are currently awaiting municipal review.');
    });

    test('shows responder actions only for authorized operational metric records', () => {
        const availableReport = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'fire',
            coordinates: { lat: 12.41, lng: 122.61 },
            createdAt: new Date().toISOString(),
        };
        renderWorkspace(createProps({
            user: { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' },
            isResponder: true,
            isReporter: false,
            reports: [availableReport],
            pendingReports: [availableReport],
            mapSummaryPanel: 'overview:responder-awaiting',
        }));

        fireEvent.click(screen.getByRole('button', { name: 'View details' }));
        expect(screen.getByRole('button', { name: 'Respond to incident' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Review resolution' })).not.toBeInTheDocument();
    });

    test('filters guest metric panels to the public status represented by the card', () => {
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'medical', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'responding-1', status: 'responding', incidentType: 'marine', coordinates: { lat: 12.42, lng: 122.62 } },
        ];
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            reports,
            mapSummaryPanel: 'overview:public-responding',
        }));

        const panel = screen.getByRole('dialog', { name: 'Active response' });
        expect(within(panel).getAllByRole('button', { name: 'View details' })).toHaveLength(1);
        expect(within(panel).getByText(/Marine.*Responding/i)).toBeInTheDocument();
        expect(within(panel).queryByText(/Medical.*Transferred/i)).not.toBeInTheDocument();
    });

    test('opens risk-zone overview metrics in the same contextual map panel', () => {
        const zone = {
            _id: 'zone-1',
            name: 'Cambijang Risk Zone',
            type: 'landslide_prone',
            coordinates: { lat: 12.405, lng: 122.69 },
        };
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
            highRiskZones: [zone],
            mapSummaryPanel: 'overview:public-risk-zones',
        }));

        const panel = screen.getByRole('dialog', { name: 'Active risk zones' });
        expect(panel.closest('[aria-label="Live incident map"]')).toBeInTheDocument();
        expect(within(panel).getByText('Cambijang Risk Zone')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View 1 risk zones\. Mapped hazards/i })).toHaveAttribute('aria-pressed', 'true');
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
        expect(mapProps.showPending).toBe(true);
        const filterBar = screen.getByLabelText('Map status filter');
        expect(within(filterBar).getByRole('button', { name: /all active/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending/i })).toBeInTheDocument();
    });

    test('gives administrators review terminology without responder actions', () => {
        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
        }));

        expect(screen.getByText('Municipal oversight')).toBeInTheDocument();
        const filterBar = screen.getByLabelText('Map status filter');
        expect(within(filterBar).getByRole('button', { name: /all active/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending/i })).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole('button', { name: /View 3 active incidents/i }));
        expect(setMapSummaryPanel).toHaveBeenCalledWith('overview:public-active');
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
        expect(screen.getByText('1 currently visible')).toBeInTheDocument();
        expect(listPanel).toHaveClass('pointer-events-auto', 'sm:w-[min(24rem,42%)]');
        expect(listPanel.closest('[aria-label="Live incident map"]')).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('');
        fireEvent.click(screen.getByRole('button', { name: 'View details' }));

        expect(screen.getByRole('dialog', { name: 'Incident details' })).toHaveClass('sm:w-[min(24rem,42%)]');
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(report.description)).toBeInTheDocument();
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Back to active incidents' }));
        expect(screen.getByRole('dialog', { name: 'Active incidents' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();

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

        expect(screen.getByRole('button', { name: /View 4 active incidents\. Across 3 map locations/i })).toBeInTheDocument();
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
        const { rerender } = renderWorkspace({ ...props, mapSummaryPanel: 'overview:public-active' });

        const incidentControl = screen.getByRole('button', { name: /View 1 active incidents/i });
        const riskZoneControl = screen.getByRole('button', { name: /View 1 risk zones/i });
        const panel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(incidentControl).toHaveAttribute('aria-pressed', 'true');
        expect(riskZoneControl).toHaveAttribute('aria-pressed', 'false');
        expect(panel.parentElement).not.toHaveClass('fixed', 'bg-black/45', 'backdrop-blur-sm');

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace {...props} mapSummaryPanel="overview:public-risk-zones" />
            </MemoryRouter>,
        );

        expect(screen.getByRole('dialog', { name: 'Active risk zones' })).toBe(panel);
        expect(screen.getByText('1 monitored zone')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /View 1 active incidents/i })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: /View 1 risk zones/i })).toHaveAttribute('aria-pressed', 'true');
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

    test('keeps the incident control and contextual list aligned with the active map filter', () => {
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 } },
        ];

        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            responderMapFilter: 'pending',
            mapSummaryPanel: 'incidents',
        }));

        expect(screen.getByRole('button', { name: /View 1 pending\. Awaiting review/i })).toHaveTextContent('1');
        const incidentPanel = screen.getByRole('dialog', { name: 'Active incidents' });
        expect(within(incidentPanel).getByText(/Vehicular.*Pending/i)).toBeInTheDocument();
        expect(within(incidentPanel).queryByText(/Fire.*Verified/i)).not.toBeInTheDocument();
        expect(within(incidentPanel).queryByText(/Medical.*Responding/i)).not.toBeInTheDocument();
        expect(mapPropsSpy.mock.lastCall[0]).toMatchObject({
            filterStatus: 'pending',
            filterMode: 'review',
        });
    });

    test('surfaces risk-zone loading and retry states without blocking the map', () => {
        const onRetryHighRiskZones = vi.fn();
        const props = createProps({
            highRiskZonesLoading: true,
            mapSummaryPanel: 'zones',
            onRetryHighRiskZones,
        });
        const { rerender } = renderWorkspace(props);

        expect(screen.getByRole('button', { name: /View 0 risk zones/i })).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Loading risk zones');
        expect(screen.getByTestId('map-view')).toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <DashboardMapWorkspace
                    {...props}
                    highRiskZonesLoading={false}
                    highRiskZonesError="High-risk zones are temporarily unavailable."
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('button', { name: /View 0 risk zones/i })).not.toHaveAttribute('aria-busy');
        expect(screen.getAllByText('High-risk zones are temporarily unavailable.')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Retry risk zones' }));
        expect(onRetryHighRiskZones).toHaveBeenCalledTimes(1);
    });

    test('renders role-aware status filter bar with counts and preserves high risk zones on map', () => {
        const setResponderMapFilter = vi.fn();
        const reports = [
            { _id: 'pending-1', status: 'pending', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 } },
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.41, lng: 122.61 } },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.42, lng: 122.62 } },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'other', coordinates: { lat: 12.43, lng: 122.63 } },
            { _id: 'resolved-1', status: 'resolved', incidentType: 'marine', coordinates: { lat: 12.44, lng: 122.64 } },
        ];
        const highRiskZones = [
            { _id: 'zone-1', name: 'Risk Zone 1', type: 'landslide_prone', coordinates: { lat: 12.4, lng: 122.6 }, radius: 100 },
        ];

        renderWorkspace(createProps({
            user: { _id: 'admin-1', role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
            isAdmin: true,
            isReporter: false,
            reports,
            highRiskZones,
            responderMapFilter: 'all',
            setResponderMapFilter,
        }));

        const filterBar = screen.getByLabelText('Map status filter');
        expect(filterBar).toBeInTheDocument();

        expect(within(filterBar).getByRole('button', { name: /all active/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /pending/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /verified/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /responding/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /transferred/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /resolved/i })).toBeInTheDocument();
        expect(within(filterBar).getByRole('button', { name: /risk zones/i })).toBeInTheDocument();

        fireEvent.click(within(filterBar).getByRole('button', { name: /risk zones/i }));
        expect(setResponderMapFilter).toHaveBeenCalledWith('risk-zones');

        fireEvent.click(within(filterBar).getByRole('button', { name: /resolved/i }));
        expect(setResponderMapFilter).toHaveBeenCalledWith('resolved');

        expect(mapPropsSpy.mock.lastCall[0].highRiskZones).toEqual(highRiskZones);
    });

    test('keeps overview metrics decoupled from active map status filters (e.g. risk-zones filter)', () => {
        const now = new Date().toISOString();
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'fire', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: now },
            { _id: 'responding-1', status: 'responding', incidentType: 'medical', coordinates: { lat: 12.41, lng: 122.61 }, createdAt: now },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'vehicular', coordinates: { lat: 12.42, lng: 122.62 }, createdAt: now },
        ];
        const highRiskZones = [
            { _id: 'zone-1', name: 'Risk Zone 1', type: 'landslide_prone', coordinates: { lat: 12.43, lng: 122.63 }, radius: 100 },
        ];

        renderWorkspace(createProps({
            user: null,
            isAdmin: false,
            isResponder: false,
            isReporter: false,
            reports,
            highRiskZones,
            responderMapFilter: 'risk-zones',
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });
        expect(within(summary).getByRole('button', { name: /View 3 active incidents/i })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: /View 1 active response/i })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: /View 1 transferred/i })).toBeInTheDocument();
        expect(within(summary).getByRole('button', { name: /View 1 risk zones/i })).toBeInTheDocument();
    });
});
