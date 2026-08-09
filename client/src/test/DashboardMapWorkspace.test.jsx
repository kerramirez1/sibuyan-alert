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
    responderMapFilter: 'all',
    setResponderMapFilter: vi.fn(),
    canCurrentResponderResolve: vi.fn(() => true),
    handleMapRespond: vi.fn(),
    handleMapResolve: vi.fn(),
    setSearchParams: vi.fn(),
    showZoneModal: false,
    setShowZoneModal: vi.fn(),
    showIncidentModal: false,
    setShowIncidentModal: vi.fn(),
    showMapPendingModal: false,
    setShowMapPendingModal: vi.fn(),
    showMapRespondingModal: false,
    setShowMapRespondingModal: vi.fn(),
    showMapResolvedModal: false,
    setShowMapResolvedModal: vi.fn(),
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

    test('uses the same gray surface for every overview card', () => {
        renderWorkspace(createProps({
            user: null,
            isAuthenticated: false,
            isReporter: false,
        }));

        const summary = screen.getByRole('region', { name: 'Map summary' });
        const cards = Array.from(summary.lastElementChild.children);

        expect(cards).toHaveLength(4);
        cards.forEach((card) => expect(card).toHaveClass('bg-gray-100'));
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
    });

    test('shows reporter actions and all active lifecycle states in the incident list', () => {
        const setShowIncidentModal = vi.fn();
        const reports = [
            { _id: 'verified-1', status: 'verified', incidentType: 'vehicular', coordinates: { lat: 12.4, lng: 122.6 }, createdAt: new Date().toISOString() },
            { _id: 'transferred-1', status: 'transferred', incidentType: 'motorcycle', coordinates: { lat: 12.5, lng: 122.7 }, createdAt: new Date().toISOString() },
            { _id: 'responding-1', status: 'responding', incidentType: 'pedestrian', coordinates: { lat: 12.6, lng: 122.8 }, createdAt: new Date().toISOString() },
        ];
        renderWorkspace(createProps({ reports, showIncidentModal: true, setShowIncidentModal }));

        expect(screen.getByRole('link', { name: /submit report/i })).toHaveAttribute('href', '/report');
        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.getByText('Responding')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^incidents$/i }));
        expect(setShowIncidentModal).toHaveBeenCalledWith(true);
    });

    test('opens the same sanitized incident description from the guest active-incidents list', () => {
        const setShowIncidentModal = vi.fn();
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
            showIncidentModal: true,
            setShowIncidentModal,
        }));

        expect(screen.getByText(report.description)).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Active incidents' })).toHaveClass('sm:max-w-2xl');
        fireEvent.click(screen.getByRole('button', { name: 'View details' }));

        expect(screen.getByRole('dialog', { name: 'Incident details' })).toHaveClass('sm:max-w-2xl');
        expect(screen.getByText('Accident at J. Rizal Street')).toBeInTheDocument();
        expect(screen.getByText(report.description)).toBeInTheDocument();
        expect(screen.getByText(/Personal identities, evidence, and internal coordination details are not displayed/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /open my full report/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back to active incidents' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close incident panel' }));
        expect(setShowIncidentModal).toHaveBeenCalledWith(false);
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

    test('locates an incident with an accurate top-down camera', () => {
        vi.useFakeTimers();
        const setSearchParams = vi.fn();
        const setShowIncidentModal = vi.fn();
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
            showIncidentModal: true,
            setSearchParams,
            setShowIncidentModal,
        }));

        fireEvent.click(screen.getByRole('button', { name: /^locate$/i }));

        expect(setSearchParams).toHaveBeenCalledWith({
            view: 'map',
            lat: 12.4044,
            lng: 122.6897,
            zoom: 16,
            pitch: 0,
            bearing: 0,
            delay: 900,
            duration: 2200,
            focus: expect.stringMatching(/^\d+-1$/),
        });
        expect(setShowIncidentModal).toHaveBeenCalledWith(false);
        expect(scrollIntoView).not.toHaveBeenCalled();
        vi.advanceTimersByTime(250);
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        vi.useRealTimers();
    });

    test('creates a new focus request for repeated locate clicks', () => {
        const setSearchParams = vi.fn();
        const setShowIncidentModal = vi.fn();
        const report = {
            _id: 'verified-1',
            status: 'verified',
            incidentType: 'motorcycle',
            coordinates: { lat: 12.4044, lng: 122.6897 },
            createdAt: new Date().toISOString(),
        };

        renderWorkspace(createProps({
            reports: [report],
            showIncidentModal: true,
            setSearchParams,
            setShowIncidentModal,
        }));

        const locateButton = screen.getByRole('button', { name: /^locate$/i });
        fireEvent.click(locateButton);
        fireEvent.click(locateButton);

        const firstFocus = setSearchParams.mock.calls[0][0].focus;
        const secondFocus = setSearchParams.mock.calls[1][0].focus;
        expect(firstFocus).not.toBe(secondFocus);
    });
});
