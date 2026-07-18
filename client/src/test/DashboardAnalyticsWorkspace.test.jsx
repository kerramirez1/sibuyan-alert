import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    AreaChart: ({ children }) => <div>{children}</div>,
    BarChart: ({ children }) => <div>{children}</div>,
    Area: () => null,
    Bar: ({ children }) => <div>{children}</div>,
    CartesianGrid: () => null,
    Cell: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

vi.mock('../components/map/MapView', () => ({
    default: () => <div data-testid="analytics-map">Map preview</div>,
}));

import DashboardAnalyticsWorkspace from '../components/dashboard/DashboardAnalyticsWorkspace';

const selectedMonth = new Date(2026, 6, 1);
const report = {
    _id: 'report-1',
    address: 'E. Aguinaldo Street, Poblacion, Cambajao, Sugod, Cajidiocan, Romblon, Mimaropa, Philippines',
    municipalityName: 'Cajidiocan',
    barangay: 'Poblacion',
    incidentType: 'vehicular_accident',
    status: 'verified',
    createdAt: '2026-07-17T14:11:00.000Z',
    updatedAt: '2026-07-17T14:20:00.000Z',
};

const baseProps = {
    user: { role: 'municipal_admin', assignedMunicipality: 'Cajidiocan' },
    hasMunicipality: true,
    showAll: false,
    setShowAll: vi.fn(),
    selectedMonth,
    setSelectedMonth: vi.fn(),
    stats: { totalReports: 1 },
    reports: [report],
    allReports: [report],
    highRiskZones: [{ _id: 'zone-1', isActive: true }],
    performanceMetrics: {
        pendingCount: 0,
        dispatchReadyCount: 1,
        respondingCount: 0,
        resolvedCount: 0,
        resolutionRate: 0,
        medianResponseMin: null,
        avgResponseMin: null,
        responseSampleCount: 0,
    },
    chartData: [
        { date: '16', fullDate: 'July 16', total: 0 },
        { date: '17', fullDate: 'July 17', total: 1 },
    ],
    statusData: [{ name: 'Verified', value: 1, color: '#3b82f6' }],
    municipalityBarData: [{ name: 'Cajidiocan', count: 1 }],
    barangayBarData: [{ name: 'Poblacion', count: 1 }],
    incidentTypeBarData: [{ name: 'Vehicular Accident', count: 1 }],
    dashboardReports: [report],
    focusLocation: null,
    historySectionRef: { current: null },
    loading: false,
    error: '',
    onOpenMap: vi.fn(),
    onOpenReports: vi.fn(),
};

describe('DashboardAnalyticsWorkspace', () => {
    test('renders a compact municipality-scoped operational dashboard', () => {
        const onOpenMap = vi.fn();
        const onOpenReports = vi.fn();
        render(<DashboardAnalyticsWorkspace {...baseProps} onOpenMap={onOpenMap} onOpenReports={onOpenReports} />);

        expect(screen.getByRole('heading', { name: 'Incident overview' })).toBeInTheDocument();
        expect(screen.getByRole('toolbar', { name: 'Analytics controls' })).toHaveClass(
            'grid-cols-1',
            'sm:grid-cols-2',
            'lg:flex',
            'lg:flex-wrap'
        );
        expect(screen.getByText('1 report recorded')).toBeInTheDocument();
        expect(screen.getByText('1 · 100%')).toBeInTheDocument();
        expect(screen.getByText('No responded incidents')).toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'By barangay' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'By incident type' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'By municipality' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Open full map' }));
        fireEvent.click(screen.getByRole('button', { name: 'View incident queue' }));
        expect(onOpenMap).toHaveBeenCalledTimes(1);
        expect(onOpenReports).toHaveBeenCalledTimes(1);

        expect(screen.getByTestId('analytics-map').parentElement).toHaveClass('h-[300px]', 'sm:h-[360px]', 'lg:h-[400px]');
        expect(screen.getByText(report.address)).toHaveClass('line-clamp-2');
        expect(screen.getByText('verified')).toHaveClass('bg-blue-50');
    });

    test('shows municipality comparisons only for the island-wide scope', () => {
        render(
            <DashboardAnalyticsWorkspace
                {...baseProps}
                hasMunicipality={false}
                showAll
                user={{ role: 'admin' }}
            />
        );

        expect(screen.getByRole('heading', { name: 'By municipality' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'By incident type' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    });
});
