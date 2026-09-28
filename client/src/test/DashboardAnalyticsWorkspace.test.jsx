import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    BarChart: ({ children }) => <div data-testid="incident-bar-chart">{children}</div>,
    LineChart: ({ children }) => <div data-testid="incident-line-chart">{children}</div>,
    Line: ({ name }) => <div>{name}</div>,
    // `maxBarSize` is consumed by recharts internally, so the mock has to record
    // the props for the bar cap to be assertable at all.
    Bar: ({ children, ...props }) => {
        mocks.barProps(props);
        return <div>{children}</div>;
    },
    LabelList: () => null,
    CartesianGrid: () => null,
    Cell: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

const mocks = vi.hoisted(() => ({ mapProps: vi.fn(), barProps: vi.fn() }));

// Reach is an admin-only fetch of its own; stubbed so the section is on screen
// and its layout is testable without a network round trip.
vi.mock('../hooks/useReachData', () => ({
    default: () => ({
        reach: {
            reports: [{ id: 'reach-1', label: 'E. Aguinaldo Street', publicViewers: 3, uniqueViewers: 4 }],
            zones: [{ id: 'reach-zone-1', label: 'Coastal cliff', publicViewers: 1, uniqueViewers: 2 }],
        },
    }),
}));

vi.mock('../components/map/MapView', () => ({
    default: (props) => {
        mocks.mapProps(props);
        return <div data-testid="analytics-map">Map preview</div>;
    },
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
        { date: 'Jul 16', fullDate: 'Jul 16, 2026', dayKey: '2026-07-16', total: 0 },
        { date: 'Jul 17', fullDate: 'Jul 17, 2026', dayKey: '2026-07-17', total: 1 },
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
    test('renders the municipal briefing with its metrics and navigation', () => {
        const onOpenMap = vi.fn();
        const onOpenReports = vi.fn();
        render(<DashboardAnalyticsWorkspace {...baseProps} onOpenMap={onOpenMap} onOpenReports={onOpenReports} />);

        expect(screen.getByRole('heading', { name: 'Incident overview' })).toBeInTheDocument();

        const pageHeading = screen.getByRole('heading', { level: 1, name: 'Municipal Situation Overview' });
        expect(pageHeading).toBeVisible();
        expect(pageHeading).not.toHaveClass('sr-only');
        expect(screen.getByText(/incident status and response readiness for/i)).toBeInTheDocument();

        expect(screen.queryByRole('button', { name: 'Cajidiocan' })).not.toBeInTheDocument();
        // One column on a phone, one left-aligned row from sm. It was a
        // two-column grid at sm, which stretched both controls to half the
        // content width — a ~350px month stepper and a ~350px Export button.
        expect(screen.getByRole('toolbar', { name: 'Analytics controls' })).toHaveClass(
            'flex-col',
            'sm:flex-row',
            'sm:flex-wrap',
            'sm:items-center'
        );
        expect(screen.getByTestId('incident-bar-chart')).toBeInTheDocument();
        expect(within(screen.getByTestId('trend-insight')).getByText(/1 report/)).toBeInTheDocument();
        const lifecycle = within(screen.getByLabelText('Report lifecycle distribution'));
        expect(lifecycle.getByText('Verified')).toBeInTheDocument();
        expect(lifecycle.getByText('100%')).toBeInTheDocument();
        expect(lifecycle.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('No responded incidents')).toBeInTheDocument();

        expect(screen.getByRole('heading', { name: 'By barangay' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'By incident type' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'By municipality' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Open full map' }));
        fireEvent.click(screen.getByRole('button', { name: 'View incident queue' }));
        expect(onOpenMap).toHaveBeenCalledTimes(1);
        expect(onOpenReports).toHaveBeenCalledTimes(1);

        // The phone frame is the operations map's 4:3 ratio, not the square this
        // card used to draw: the same map is the same shape on both pages.
        expect(screen.getByTestId('analytics-map').parentElement).toHaveClass(
            'aspect-[4/3]',
            'w-full',
            'sm:aspect-auto',
            'sm:h-[360px]',
            'lg:h-[400px]',
        );
        const recentActivitySection = screen.getByLabelText('Recent activity');
        const activityButton = within(recentActivitySection).getByRole('button', { name: /^View incident queue: E\. Aguinaldo/ });
        expect(activityButton).toHaveTextContent(report.address);
        activityButton.focus();
        expect(activityButton).toHaveFocus();
        fireEvent.click(activityButton);
        expect(onOpenReports).toHaveBeenCalledTimes(2);

        const activityBadge = within(recentActivitySection).getByText('Verified');
        expect(activityBadge).toBeInTheDocument();
        expect(activityBadge).not.toHaveClass('border-gray-200/90', 'bg-gray-50/80', 'rounded-md');
    }, 12000);

    test('draws the analytics map filter as the shared operations rail', () => {
        mocks.mapProps.mockClear();
        // One report per status, each with coordinates so it is genuinely on the
        // map: the counts below are then the sets the tabs claim to be.
        const scoped = [
            { ...report, _id: 'scope-pending', status: 'pending', coordinates: { lat: 12.45, lng: 122.55 } },
            { ...report, _id: 'scope-verified', status: 'verified', coordinates: { lat: 12.46, lng: 122.56 } },
            { ...report, _id: 'scope-responding', status: 'responding', coordinates: { lat: 12.47, lng: 122.57 } },
            { ...report, _id: 'scope-resolved', status: 'resolved', coordinates: { lat: 12.48, lng: 122.58 } },
        ];
        render(<DashboardAnalyticsWorkspace {...baseProps} reports={scoped} allReports={scoped} />);

        const rail = screen.getByRole('group', { name: 'Map status filter' });

        // The operations rail's own tabs, in its wording. `all` is the month's
        // whole record — closed incidents included — and the three handled states
        // are ONE tab: this view used to split them into Verified / Active
        // response / Transferred and call the open set "Active Incidents", the
        // rail's name for the pending-excluded subset.
        expect(within(rail).getByRole('button', { name: /All open filter \(4 records\), selected/ })).toBeInTheDocument();
        expect(within(rail).getByRole('button', { name: /Pending review filter \(1 record\)/ })).toBeInTheDocument();
        expect(within(rail).getByRole('button', { name: /Active incidents filter \(2 records\)/ })).toBeInTheDocument();
        expect(within(rail).getByRole('button', { name: /^Resolved filter \(1 record\)/ })).toBeInTheDocument();

        // They reconcile: All open = Pending review + Active incidents + Resolved,
        // which is what including the closed incidents in `all` buys.
        for (const split of [/Verified filter/i, /Active response filter/i, /Transferred filter/i]) {
            expect(within(rail).queryByRole('button', { name: split })).not.toBeInTheDocument();
        }

        // And no hazard layer: zones are not part of a month's incident
        // distribution, so nothing sits behind a divider any more.
        expect(within(rail).queryByRole('button', { name: /Risk zones/i })).not.toBeInTheDocument();
        expect(within(rail).queryByRole('group', { name: 'Layers and archive' })).not.toBeInTheDocument();

        // Selected state is the rail's tinted surface plus its 2px bar — not the
        // `border-b-2` this row used to carry, which the base stylesheet zeroes
        // out on a button and so rendered no selected tab at all.
        const selected = within(rail).getByRole('button', { name: /All open filter/ });
        expect(selected).toHaveAttribute('aria-pressed', 'true');
        expect(selected).toHaveClass('bg-gray-100/80', 'font-semibold');
        expect(selected).not.toHaveClass('border-b-2');
        expect(selected.querySelector('[class*="h-[2px]"]')).toHaveClass('bg-gray-500');

        // The canvas has to agree with the tab above it: `allIncludesResolved` is
        // what makes the map draw the same set the All open count names, and with
        // no hazard tab the zones are not handed over at all.
        const mapProps = mocks.mapProps.mock.calls.at(-1)[0];
        expect(mapProps.allIncludesResolved).toBe(true);
        expect(mapProps.highRiskZones).toBeUndefined();
        expect(mapProps.filterStatus).toBe('all');

        fireEvent.click(within(rail).getByRole('button', { name: /Pending review filter/ }));
        expect(mocks.mapProps.mock.calls.at(-1)[0].filterStatus).toBe('pending');
    });

    test('opens the monthly map on the operations map default camera', () => {
        mocks.mapProps.mockClear();
        render(<DashboardAnalyticsWorkspace {...baseProps} />);

        // The two props the operations workspace hands its own MapView. Without
        // them this card alone fell back to the island view, so an admin who
        // switched from Map to Analytics watched their incidents leave the frame.
        const mapProps = mocks.mapProps.mock.calls.at(-1)[0];
        expect(mapProps.frameReportsOnOpen).toBe(true);
        expect(mapProps.homeFocus).toEqual({ lat: 12.4044, lng: 122.6897, zoom: 12 });
    });

    test('leaves the camera to a deep link and to viewers without an assignment', () => {
        mocks.mapProps.mockClear();
        render(
            <DashboardAnalyticsWorkspace
                {...baseProps}
                focusLocation={{ lat: 12.46, lng: 122.56, requestId: 'deep-link' }}
            />
        );

        // A link to one record owns the camera, so home steps aside for it.
        expect(mocks.mapProps.mock.calls.at(-1)[0].homeFocus).toBeNull();

        mocks.mapProps.mockClear();
        render(
            <DashboardAnalyticsWorkspace
                {...baseProps}
                hasMunicipality={false}
                user={null}
            />
        );

        // No assignment to rest on, so the island view stays the fallback.
        const guestProps = mocks.mapProps.mock.calls.at(-1)[0];
        expect(guestProps.frameReportsOnOpen).toBe(false);
        expect(guestProps.homeFocus).toBeNull();
    });

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

    describe('responsive layout', () => {
        const severityTrend = [
            { date: 'Sep 5', fullDate: 'Sep 5, 2026', dayKey: '2026-09-05', total: 2, minor: 1, moderate: 1, severe: 0, critical: 0 },
            { date: 'Sep 6', fullDate: 'Sep 6, 2026', dayKey: '2026-09-06', total: 0, minor: 0, moderate: 0, severe: 0, critical: 0 },
        ];

        test('rules the overview band for the phone layout and for four across from md', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} />);

            const band = screen.getByTestId('overview-band');

            // Four across is an md layout: a 640px viewport leaves 592px of
            // content, which is 148px per tile — narrower than the phone's own
            // two-column tiles, so sm was the band's most cramped state.
            expect(band).toHaveClass('grid-cols-2', 'md:grid-cols-4');

            // `divide-y` is the trap this band fell into: it rules the top of
            // every child but the first, so in the two-column layout it drew a
            // line above the tile BESIDE the first one. The hairlines are
            // per-child widths now — even children carry the vertical rule, the
            // two bottom tiles the horizontal one — and no `divide-x`/`divide-y`
            // is left to disagree with the grid's shape.
            expect(band.className).not.toMatch(/divide-[xy](\s|$)/);
            expect(band).toHaveClass(
                '[&>*:nth-child(even)]:border-l',
                'md:[&>*:nth-child(3)]:border-l',
                'max-md:[&>*:nth-child(n+3)]:border-t',
            );
        });

        test('keeps severity context and a labeled alternative to selecting chart bars', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} chartData={severityTrend} />);

            const legend = within(screen.getByLabelText('Severity legend'));
            expect(legend.getByText('Minor')).toBeInTheDocument();
            expect(legend.getByText('Moderate')).toBeInTheDocument();
            expect(screen.getByRole('combobox', { name: 'Filter map by day' })).toHaveValue('');
            expect(screen.getByRole('option', { name: /Sep 5, 2026 · 2 reports/ })).toBeInTheDocument();
        });

        test('splits the insight and breakdown sections where their columns actually fit', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} chartData={severityTrend} />);

            // A 768px tablet and a 1024px laptop both leave 720px of content —
            // the sidebar spends exactly what the wider padding gives back — so
            // the 2×2 and the two-column splits are keyed to the width they need:
            // two cards from md, the trend/lifecycle split from xl.
            const insights = screen.getByLabelText('Monthly insights');
            expect(insights).toHaveClass('xl:grid-cols-5');
            expect(insights.className).not.toMatch(/\blg:grid-cols-5\b/);
            expect(screen.getByRole('heading', { name: 'Incident trend' }).closest('div[class*="xl:col-span-3"]')).not.toBeNull();
            expect(screen.getByRole('heading', { name: 'Report lifecycle' }).closest('div[class*="xl:col-span-2"]')).not.toBeNull();

            const operational = screen.getByLabelText('Operational breakdown');
            expect(operational).toHaveClass('md:grid-cols-2');
            expect(operational.className).not.toMatch(/\blg:grid-cols-2\b/);

            const reachSection = screen.getByLabelText('Reach');
            const reachGrid = reachSection.querySelector('[class*="grid"]');
            expect(reachGrid).toHaveClass('md:grid-cols-2');
            expect(reachGrid.className).not.toMatch(/\blg:grid-cols-2\b/);
        });

        test('renders Reach comparison panels with a single shared explanatory note', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} />);

            const reachSection = screen.getByLabelText('Reach');
            expect(within(reachSection).getByRole('heading', { name: 'Incident reach' })).toBeInTheDocument();
            expect(within(reachSection).getByRole('heading', { name: 'Risk zone reach' })).toBeInTheDocument();

            const notes = within(reachSection).getAllByText(
                'Counts unique detail viewers, not map views. Public includes anonymous visitors and verified reporters; All viewers also includes responders and municipal admins.'
            );
            expect(notes).toHaveLength(1);
        });

        test('caps and centres the insights section instead of letting it run to the workspace edge', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} />);

            // The workspace runs to 1500px. Uncapped, a 1920px display handed the
            // trend panel ~1000px; the cap holds the plot near the ~640px it was
            // tuned at, and mx-auto keeps the section on the content axis.
            const insights = screen.getByLabelText('Monthly insights');
            expect(insights).toHaveClass('mx-auto', 'w-full', 'max-w-6xl');
        });

        test('caps bar width so a scope with few buckets cannot draw oversized bars', () => {
            mocks.barProps.mockClear();
            render(<DashboardAnalyticsWorkspace {...baseProps} />);

            const caps = mocks.barProps.mock.calls.map(([props]) => props.maxBarSize);

            // Every severity series carries the cap. Monthly's 28-31 categories
            // already sit well under it, so this only bites where a scope draws
            // twelve bars or one.
            expect(caps.length).toBeGreaterThan(0);
            expect(caps.every((value) => value === 56)).toBe(true);
        });

        test('lists a thin bucketed trend rather than stretching a near-empty chart', () => {
            const february = {
                ...report,
                _id: 'feb-1',
                createdAt: '2026-02-10T10:00:00+08:00',
                updatedAt: '2026-02-10T10:00:00+08:00',
            };
            const yearlyTrend = [
                { date: 'Jan', fullDate: 'January 2026', dayKey: '2026-01', total: 0, minor: 0, moderate: 0, severe: 0, critical: 0, unknown: 0 },
                { date: 'Feb', fullDate: 'February 2026', dayKey: '2026-02', total: 3, minor: 1, moderate: 0, severe: 0, critical: 2, unknown: 0 },
                { date: 'Mar', fullDate: 'March 2026', dayKey: '2026-03', total: 0, minor: 0, moderate: 0, severe: 0, critical: 0, unknown: 0 },
            ];

            mocks.mapProps.mockClear();
            render(
                <DashboardAnalyticsWorkspace
                    {...baseProps}
                    analyticsScope="yearly"
                    selectedYear={2026}
                    setSelectedYear={vi.fn()}
                    reports={[february]}
                    allReports={[february]}
                    chartData={yearlyTrend}
                />
            );

            // One active bucket out of twelve: no plot, but the period, the count
            // and the drill-down all survive.
            expect(screen.queryByTestId('incident-bar-chart')).not.toBeInTheDocument();
            const list = screen.getByTestId('incident-days-list');
            expect(within(list).getByText('February 2026')).toBeInTheDocument();
            expect(within(list).getByText('3 reports')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Filter map to February 2026, 3 reports' }));

            expect(screen.getByText('Showing Feb')).toBeInTheDocument();
            expect(mocks.mapProps.mock.calls.at(-1)[0].reports.map((item) => item._id)).toEqual(['feb-1']);
        });

        test('keeps the bar chart for a bucketed scope with more than two active buckets', () => {
            const yearlyTrend = ['Jan', 'Feb', 'Mar'].map((label, index) => ({
                date: label,
                fullDate: `${label}uary 2026`,
                dayKey: `2026-0${index + 1}`,
                total: 1,
                minor: 1,
                moderate: 0,
                severe: 0,
                critical: 0,
                unknown: 0,
            }));

            render(
                <DashboardAnalyticsWorkspace
                    {...baseProps}
                    analyticsScope="yearly"
                    selectedYear={2026}
                    setSelectedYear={vi.fn()}
                    chartData={yearlyTrend}
                />
            );

            // Three active months is a trend, not a list.
            expect(screen.getByTestId('incident-bar-chart')).toBeInTheDocument();
            expect(screen.queryByTestId('incident-days-list')).not.toBeInTheDocument();
        });
    });

    describe('trend insight and day drill-down', () => {
        const july = new Date(2026, 6, 1);
        const julyReports = [
            { _id: 'r1', createdAt: '2026-07-08T10:00:00', severity: 'moderate', status: 'verified', address: 'Road A', municipalityName: 'Cajidiocan', updatedAt: '2026-07-08T10:00:00' },
            { _id: 'r2', createdAt: '2026-07-08T11:00:00', severity: 'critical', status: 'verified', address: 'Road B', municipalityName: 'Cajidiocan', updatedAt: '2026-07-08T11:00:00' },
            { _id: 'r3', createdAt: '2026-07-09T10:00:00', severity: 'minor', status: 'verified', address: 'Road C', municipalityName: 'Cajidiocan', updatedAt: '2026-07-09T10:00:00' },
        ];
        const julyTrend = [
            { date: 'Jul 8', fullDate: 'Jul 8, 2026', dayKey: '2026-07-08', total: 2, minor: 0, moderate: 1, severe: 0, critical: 1 },
            { date: 'Jul 9', fullDate: 'Jul 9, 2026', dayKey: '2026-07-09', total: 1, minor: 1, moderate: 0, severe: 0, critical: 0 },
            { date: 'Jul 10', fullDate: 'Jul 10, 2026', dayKey: '2026-07-10', total: 0, minor: 0, moderate: 0, severe: 0, critical: 0 },
        ];
        const julyProps = {
            ...baseProps,
            selectedMonth: july,
            reports: julyReports,
            allReports: julyReports,
            chartData: julyTrend,
        };

        test('renders one-line insight with peak, quiet days, and month delta', () => {
            render(<DashboardAnalyticsWorkspace {...julyProps} />);

            expect(screen.getByTestId('incident-bar-chart')).toBeInTheDocument();
            const insight = within(screen.getByTestId('trend-insight'));
            expect(insight.getByText(/3 reports/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Filter map to Jul 8, 2026' })).toHaveTextContent('Jul 8');
            expect(insight.getByText(/1 quiet day/)).toBeInTheDocument();
            expect(insight.getByText(/3 more than Jun/)).toBeInTheDocument();
        });

        test('peak-day button filters the monthly map and clears cleanly', () => {
            mocks.mapProps.mockClear();
            render(<DashboardAnalyticsWorkspace {...julyProps} />);

            fireEvent.click(screen.getByRole('button', { name: 'Filter map to Jul 8, 2026' }));

            expect(screen.getByText('Showing Jul 8')).toBeInTheDocument();
            const lastCall = mocks.mapProps.mock.calls.at(-1)[0];
            expect(lastCall.reports.map((r) => r._id).sort()).toEqual(['r1', 'r2']);

            fireEvent.click(screen.getByRole('button', { name: 'Clear day filter Jul 8' }));

            expect(screen.queryByText('Showing Jul 8')).not.toBeInTheDocument();
            const clearedCall = mocks.mapProps.mock.calls.at(-1)[0];
            expect(clearedCall.reports).toHaveLength(3);
        });

        test('day selector shares the chart drill-down and resets on month changes', () => {
            mocks.mapProps.mockClear();
            const { rerender } = render(<DashboardAnalyticsWorkspace {...julyProps} />);
            const selector = screen.getByRole('combobox', { name: 'Filter map by day' });

            fireEvent.change(selector, { target: { value: '2026-07-09' } });
            expect(screen.getByText('Showing Jul 9')).toBeInTheDocument();
            expect(mocks.mapProps.mock.calls.at(-1)[0].reports.map((item) => item._id)).toEqual(['r3']);

            fireEvent.change(selector, { target: { value: '' } });
            expect(screen.queryByText('Showing Jul 9')).not.toBeInTheDocument();
            expect(mocks.mapProps.mock.calls.at(-1)[0].reports).toHaveLength(3);

            fireEvent.change(selector, { target: { value: '2026-07-08' } });
            rerender(<DashboardAnalyticsWorkspace {...julyProps} selectedMonth={new Date(2026, 7, 1)} />);
            expect(selector).toHaveValue('');
            expect(screen.queryByText('Showing Jul 8')).not.toBeInTheDocument();
            expect(mocks.mapProps.mock.calls.at(-1)[0].reports).toHaveLength(3);
        });

        test('lists active days instead of a near-empty chart for a sparse full month', () => {
            const september = new Date(2026, 8, 1);
            const sparseTrend = Array.from({ length: 30 }, (_, index) => {
                const day = index + 1;
                const isActive = day === 5;
                return {
                    date: `Sep ${day}`,
                    fullDate: `Sep ${day}, 2026`,
                    dayKey: `2026-09-${String(day).padStart(2, '0')}`,
                    total: isActive ? 1 : 0,
                    minor: 0,
                    moderate: 0,
                    severe: 0,
                    critical: isActive ? 1 : 0,
                };
            });
            const sparseReport = {
                ...julyReports[0],
                _id: 'sep-1',
                createdAt: '2026-09-05T10:00:00',
                updatedAt: '2026-09-05T10:00:00',
                severity: 'critical',
            };
            render(
                <DashboardAnalyticsWorkspace
                    {...baseProps}
                    selectedMonth={september}
                    reports={[sparseReport]}
                    allReports={[sparseReport]}
                    chartData={sparseTrend}
                />
            );

            expect(screen.queryByTestId('incident-bar-chart')).not.toBeInTheDocument();
            const daysList = screen.getByTestId('incident-days-list');
            expect(within(daysList).getByText('Sep 5, 2026')).toBeInTheDocument();
            expect(within(daysList).getByText('1 report')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Filter map to Sep 5, 2026, 1 report' }));
            expect(screen.getByText('Showing Sep 5')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Filter map to Sep 5, 2026, 1 report' }));
            expect(screen.queryByText('Showing Sep 5')).not.toBeInTheDocument();
        });
    });

    describe('reporting scope control', () => {
        const currentYear = new Date().getFullYear();

        test('groups the three scopes into one segmented control, Monthly by default', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} />);

            const group = screen.getByRole('group', { name: 'Scope' });
            const options = within(group).getAllByRole('button');

            // Three separate selectable options, not a run of words.
            expect(options.map((button) => button.textContent)).toEqual(['Monthly', 'Yearly', 'All time']);
            expect(within(group).getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true');
            expect(within(group).getByRole('button', { name: 'Yearly' })).toHaveAttribute('aria-pressed', 'false');
            expect(within(group).getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'false');

            // Selection is never colour alone: the active option is the one that
            // carries the check, and the two beside it carry none.
            expect(within(group).getByRole('button', { name: 'Monthly' }).querySelector('svg')).not.toBeNull();
            expect(within(group).getByRole('button', { name: 'Yearly' }).querySelector('svg')).toBeNull();
        });

        test('shows the month picker only in Monthly and the year picker only in Yearly', () => {
            const { rerender } = render(<DashboardAnalyticsWorkspace {...baseProps} />);

            expect(screen.getByText('Reporting month')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
            expect(screen.queryByText('Reporting year')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Previous year' })).not.toBeInTheDocument();

            rerender(
                <DashboardAnalyticsWorkspace
                    {...baseProps}
                    analyticsScope="yearly"
                    selectedYear={currentYear}
                    setSelectedYear={vi.fn()}
                />
            );

            expect(screen.getByText('Reporting year')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Previous year' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled();
            expect(screen.queryByText('Reporting month')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument();

            // The panels follow the scope rather than still describing a month.
            expect(screen.getByText(new RegExp(`readiness for ${currentYear}\\.`))).toBeInTheDocument();
            expect(screen.getByLabelText('Yearly insights')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Yearly incident map' })).toBeInTheDocument();
        });

        test('drops every period control in All time, leaving the scope and the subtitle to speak', () => {
            render(<DashboardAnalyticsWorkspace {...baseProps} analyticsScope="all_time" />);

            // No period label, no calendar, no picker — the whole cluster is gone,
            // not merely disabled.
            expect(screen.queryByText('Reporting month')).not.toBeInTheDocument();
            expect(screen.queryByText('Reporting year')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Previous month' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Previous year' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Return to current month' })).not.toBeInTheDocument();

            // What replaces it is the active scope and the subtitle.
            expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText(/readiness for all recorded incidents\./)).toBeInTheDocument();
            expect(screen.getByLabelText('All-time insights')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'All-time incident map' })).toBeInTheDocument();
        });

        test('reports the chosen scope and keeps export outside the scope group', () => {
            const setAnalyticsScope = vi.fn();
            render(<DashboardAnalyticsWorkspace {...baseProps} setAnalyticsScope={setAnalyticsScope} />);

            const group = screen.getByRole('group', { name: 'Scope' });
            fireEvent.click(within(group).getByRole('button', { name: 'Yearly' }));

            expect(setAnalyticsScope).toHaveBeenCalledWith('yearly');

            // Export is an action, not a scope option, so it never sits in the group.
            expect(within(group).queryByRole('button', { name: 'Export dashboard data as Excel' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Export dashboard data as Excel' })).toBeInTheDocument();
        });
    });
});
