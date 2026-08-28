import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    LineChart: ({ children }) => <div data-testid="incident-line-chart">{children}</div>,
    BarChart: ({ children }) => <div>{children}</div>,
    Line: ({ name }) => <div>{name}</div>,
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

import DashboardAnalyticsWorkspace, { formatXAxisDay } from '../components/dashboard/DashboardAnalyticsWorkspace';

const selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
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
        { date: 'Jul 16', fullDate: 'Jul 16, 2026', total: 0 },
        { date: 'Jul 17', fullDate: 'Jul 17, 2026', total: 1 },
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
        expect(screen.queryByRole('button', { name: 'Cajidiocan' })).not.toBeInTheDocument();
        expect(screen.getByRole('toolbar', { name: 'Analytics controls' })).toHaveClass(
            'grid-cols-1',
            'sm:grid-cols-2',
            'lg:flex',
            'lg:flex-wrap'
        );
        expect(screen.getByTestId('incident-line-chart')).toBeInTheDocument();
        expect(screen.getAllByText('Daily reports')).not.toHaveLength(0);
        expect(screen.getByText('1 · 100%')).toBeInTheDocument();
        expect(screen.getByText('No responded incidents')).toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'By barangay' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'By incident type' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'By municipality' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Open full map' }));
        fireEvent.click(screen.getByRole('button', { name: 'View incident queue' }));
        expect(onOpenMap).toHaveBeenCalledTimes(1);
        expect(onOpenReports).toHaveBeenCalledTimes(1);

        expect(screen.getByTestId('analytics-map').parentElement).toHaveClass(
            'aspect-square',
            'w-full',
            'sm:aspect-auto',
            'sm:h-[360px]',
            'lg:h-[400px]',
        );
        expect(screen.getByText(report.address)).toHaveClass('truncate');

        const recentActivitySection = screen.getByLabelText('Recent activity');
        const activityBadge = within(recentActivitySection).getByText('Verified');
        expect(activityBadge).toBeInTheDocument();
        expect(activityBadge.parentElement).toHaveClass('border-gray-200/90', 'bg-gray-50/80');
    }, 12000);

    test('shows municipality comparisons only when no municipal scope is provided', () => {
        render(
            <DashboardAnalyticsWorkspace
                {...baseProps}
                hasMunicipality={false}
                user={null}
            />
        );

        expect(screen.getByRole('heading', { name: 'By municipality' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'By incident type' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    });

    test('keeps a dedicated empty state when the selected period has no reports', () => {
        render(
            <DashboardAnalyticsWorkspace
                {...baseProps}
                reports={[]}
                chartData={baseProps.chartData.map((day) => ({ ...day, total: 0 }))}
            />
        );

        expect(screen.getByText('No reports in this period')).toBeInTheDocument();
        expect(screen.getByText('Choose another month.')).toBeInTheDocument();
        expect(screen.queryByText(/expand the municipality scope/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('incident-line-chart')).not.toBeInTheDocument();
    });

    test('formatXAxisDay extracts day number across various date representations', () => {
        expect(formatXAxisDay('Aug 1')).toBe('1');
        expect(formatXAxisDay('Aug 3')).toBe('3');
        expect(formatXAxisDay('Aug 15')).toBe('15');
        expect(formatXAxisDay('Aug 31')).toBe('31');
        expect(formatXAxisDay('Jan 1')).toBe('1');
        expect(formatXAxisDay('Feb 28')).toBe('28');
        expect(formatXAxisDay('Apr 30')).toBe('30');
        expect(formatXAxisDay(7)).toBe('7');
        expect(formatXAxisDay('2026-08-19')).toBe('19');
        expect(formatXAxisDay(null)).toBe('');
        expect(formatXAxisDay(undefined)).toBe('');
    });
});
