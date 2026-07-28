import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mapPropsSpy } = vi.hoisted(() => ({ mapPropsSpy: vi.fn() }));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mapPropsSpy(props);
        return <div data-testid="map-view" />;
    },
}));

vi.mock('../components/ui/Modal', () => ({
    default: ({ isOpen, title, children }) => isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
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
});
