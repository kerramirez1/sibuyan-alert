import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResponderDashboardWorkspace from '../components/dashboard/ResponderDashboardWorkspace';

vi.mock('../services/api', () => ({
    systemAPI: { getHealth: vi.fn().mockResolvedValue({ data: { success: true } }) },
}));

const mockUser = {
    _id: 'responder-1',
    name: 'Officer Dela Cruz',
    role: 'responder',
    agency: 'PNP',
    assignedMunicipality: 'Cajidiocan',
};

const mockStats = {
    activeIncidents: 3,
    availableIncidents: 2,
    myActiveDeployments: 1,
    resolvedToday: 2,
    activeRiskZones: 4,
    reportsByBarangay: [
        { barangay: 'Poblacion', count: 5, injured: 2, fatalities: 0 },
        { barangay: 'Sugod', count: 3, injured: 1, fatalities: 1 },
        { barangay: 'Cambalo', count: 1, injured: 0, fatalities: 0 },
    ],
    criticalHighRiskZones: [
        {
            _id: 'zone-1',
            name: 'España Blind Curve',
            description: 'Sharp curve with limited visibility and steep shoulder.',
            type: 'accident_prone',
            severity: 'high',
            barangay: 'España',
            radius: 150,
        },
        {
            _id: 'zone-2',
            name: 'Sugod Coastal Highway',
            description: 'Prone to storm surges and road slipperiness.',
            type: 'landslide_prone',
            severity: 'critical',
            barangay: 'Sugod',
            radius: 300,
        },
    ],
};

const renderWorkspace = (props = {}) => render(
    <ResponderDashboardWorkspace
        user={mockUser}
        stats={mockStats}
        loading={false}
        {...props}
    />
);

describe('ResponderDashboardWorkspace', () => {
    it('renders the operations header with agency and assigned municipality', () => {
        renderWorkspace();

        expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/Responder operations/i)).toBeInTheDocument();
        expect(screen.getByText(/System active/i)).toBeInTheDocument();
        expect(screen.getByText(/PNP · Cajidiocan/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /dispatch queue/i })).toHaveAttribute(
            'href',
            '/admin/reports?view=dispatch-queue'
        );
        expect(screen.getByText('Active emergencies').closest('a')).toHaveAttribute(
            'href',
            '/admin/reports?view=active-incidents'
        );
        expect(screen.getByText('My active responses').closest('a')).toHaveAttribute(
            'href',
            '/admin/reports?view=active-responses'
        );
        expect(screen.getByText('Resolved today').closest('a')).toHaveAttribute(
            'href',
            '/accident-history?date=today'
        );
        expect(screen.getByRole('link', { name: /^safety map$/i })).toHaveAttribute(
            'href',
            '/dashboard?view=map'
        );
    });

    it('renders all 4 operational KPI metrics correctly', () => {
        renderWorkspace();

        const emergenciesCard = screen.getByText('Active emergencies').closest('a');
        expect(emergenciesCard).toBeInTheDocument();
        expect(emergenciesCard).toHaveTextContent('3');

        const deploymentsCard = screen.getByText('My active responses').closest('a');
        expect(deploymentsCard).toBeInTheDocument();
        expect(deploymentsCard).toHaveTextContent('1');

        const resolvedCard = screen.getByText('Resolved today').closest('a');
        expect(resolvedCard).toBeInTheDocument();
        expect(resolvedCard).toHaveTextContent('2');

        const riskZonesCard = screen.getByText('Monitored risk zones').closest('a');
        expect(riskZonesCard).toBeInTheDocument();
        expect(riskZonesCard).toHaveTextContent('4');

        [emergenciesCard, deploymentsCard, resolvedCard, riskZonesCard].forEach((card) => {
            expect(card.querySelector('img')).toBeNull();
            expect(card.querySelectorAll('svg')).toHaveLength(1);
            expect(card.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
            expect(card).toHaveClass(
                'cursor-pointer',
                'metric-tile',
                'hover:bg-[var(--surface-hover)]',
            );
            expect(card).not.toHaveClass('rounded-xl', 'shadow-sm', 'border-transparent');
        });
        expect(resolvedCard).toHaveAccessibleName(/View today's records/i);
        expect(emergenciesCard.parentElement?.parentElement).toHaveClass('metric-strip');
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
        expect(screen.queryByText('On Mission')).not.toBeInTheDocument();
    });

    it('renders barangay incident distributions with casualty tags', () => {
        renderWorkspace();

        expect(screen.getByText('Barangay distribution')).toBeInTheDocument();
        expect(screen.getByText('Poblacion')).toBeInTheDocument();
        expect(screen.getByText('5 incidents')).toBeInTheDocument();
        expect(screen.getByText('2 inj.')).toBeInTheDocument();

        expect(screen.getByText('Sugod')).toBeInTheDocument();
        expect(screen.getByText('3 incidents')).toBeInTheDocument();
        expect(screen.getByText('1 fatal')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Poblacion: 5 incidents' }).firstElementChild).toHaveStyle({ width: '100%' });
        expect(screen.getByRole('img', { name: 'Sugod: 3 incidents' }).firstElementChild).toHaveStyle({ width: '60%' });
    });

    it('renders high-risk hazard zones with severity and type badges', () => {
        renderWorkspace();

        expect(screen.getByText('Hazard watchlist')).toBeInTheDocument();
        expect(screen.getByText('España Blind Curve')).toBeInTheDocument();
        expect(screen.getByText('Accident Prone')).toBeInTheDocument();
        expect(screen.getByText('Sugod Coastal Highway')).toBeInTheDocument();
        expect(screen.getByText('Landslide Prone')).toBeInTheDocument();
        const zoneLinks = screen.getAllByRole('link', { name: /view .* on map/i });
        expect(zoneLinks).toHaveLength(2);
        expect(zoneLinks[0]).toHaveAttribute('href', '/dashboard?view=map&riskZone=zone-1');
        expect(zoneLinks[1]).toHaveAttribute('href', '/dashboard?view=map&riskZone=zone-2');
        expect(screen.getByText('Accident Prone').closest('a')).toBe(zoneLinks[0]);
    });

    it('does not render the removed operational presence section', () => {
        renderWorkspace();

        expect(screen.queryByText(/Multi-agency readiness/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/currently online/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Loading operational presence')).not.toBeInTheDocument();
    });

    it('shows a dedicated initial loading state instead of all-clear empty states', () => {
        render(
            <ResponderDashboardWorkspace
                user={mockUser}
                stats={null}
                loading
            />
        );

        expect(screen.getByRole('status', { name: /loading dashboard/i })).toBeInTheDocument();
        expect(screen.queryByText('No incident hotspots recorded')).not.toBeInTheDocument();
    });

    it('shows a retryable analytics error when no dashboard data is available', () => {
        const onRetry = vi.fn();
        render(
            <ResponderDashboardWorkspace
                user={mockUser}
                stats={null}
                loading={false}
                error="Analytics service unavailable"
                onRetry={onRetry}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('Analytics service unavailable');
        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it('renders empty fallback states gracefully when stats arrays are empty', () => {
        renderWorkspace({
            stats: {
                activeIncidents: 0,
                availableIncidents: 0,
                myActiveDeployments: 0,
                resolvedToday: 0,
                activeRiskZones: 0,
                reportsByBarangay: [],
                criticalHighRiskZones: [],
            },
        });

        expect(screen.getByText('No incident hotspots recorded')).toBeInTheDocument();
        expect(screen.getByText('No critical or high-priority zones')).toBeInTheDocument();
    });

    it('normalizes malformed analytics values without breaking the dashboard', () => {
        renderWorkspace({
            stats: {
                activeIncidents: 'invalid',
                availableIncidents: -3,
                myActiveDeployments: null,
                resolvedToday: 1.8,
                activeRiskZones: Number.NaN,
                reportsByBarangay: null,
                criticalHighRiskZones: {},
            },
        });

        expect(screen.getByText('Active emergencies').closest('a')).toHaveTextContent('0');
        expect(screen.getByText('Resolved today').closest('a')).toHaveTextContent('1');
        expect(screen.getByText('No incident hotspots recorded')).toBeInTheDocument();
        expect(screen.getByText('No critical or high-priority zones')).toBeInTheDocument();
    });

    describe('presence indicator', () => {
        it('renders the online-responder count when the presence prop is present', () => {
            renderWorkspace({ presence: { respondersOnline: 3 } });

            expect(screen.getByText(/· 3 responders online/)).toBeInTheDocument();
        });

        it('says the viewer is the only responder online when the count is 1 and they are online', () => {
            renderWorkspace({ presence: { respondersOnline: 1, viewerIsOnline: true } });

            expect(screen.getByText(/· You are the only responder online/)).toBeInTheDocument();
        });

        it('falls back to "1 responder online" when viewerIsOnline is absent', () => {
            renderWorkspace({ presence: { respondersOnline: 1 } });

            expect(screen.getByText(/· 1 responder online/)).toBeInTheDocument();
        });

        it('falls back to "1 responder online" when viewerIsOnline is false', () => {
            renderWorkspace({ presence: { respondersOnline: 1, viewerIsOnline: false } });

            expect(screen.getByText(/· 1 responder online/)).toBeInTheDocument();
        });

        it('renders nothing extra when presence is absent', () => {
            renderWorkspace();

            expect(screen.queryByText(/responders? online/)).not.toBeInTheDocument();
        });

        it('renders nothing extra when the count is not a finite number', () => {
            renderWorkspace({ presence: { respondersOnline: 'many' } });

            expect(screen.queryByText(/responders? online/)).not.toBeInTheDocument();
        });
    });
});
