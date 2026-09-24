import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import MapFilterRail, { statusTabTitle } from '../components/dashboard/MapFilterRail';

const SIGNED_IN_FILTERS = [
    { value: 'all', label: 'All open', group: 'status' },
    { value: 'pending', label: 'Pending review', group: 'status' },
    { value: 'active', label: 'Active incidents', group: 'status' },
    { value: 'risk-zones', label: 'Risk zones', group: 'layers' },
    { value: 'resolved', label: 'Resolved archive', group: 'layers' },
];

const GUEST_FILTERS = [
    { value: 'all', label: 'Active Incidents', group: 'status' },
    { value: 'risk-zones', label: 'Risk zones', group: 'layers' },
    { value: 'resolved', label: 'Resolved archive', group: 'layers' },
];

describe('statusTabTitle helper', () => {
    test('returns accurate tooltip for active incidents describing verified, transferred, and responding reports', () => {
        const title = statusTabTitle({ value: 'active', label: 'Active incidents' }, true);
        expect(title).toBe('Verified, transferred, and responding reports');
    });

    test('returns accurate tooltip for pending review describing reports awaiting verification', () => {
        const title = statusTabTitle({ value: 'pending', label: 'Pending review' }, true);
        expect(title).toBe('Reports awaiting verification');
    });

    test('preserves scope-aware tooltip for "all" open reports vs guest active incidents', () => {
        const signedInTitle = statusTabTitle({ value: 'all', label: 'All open' }, true);
        expect(signedInTitle).toBe('All open reports (pending + being handled)');

        const guestTitle = statusTabTitle({ value: 'all', label: 'Active Incidents' }, false);
        expect(guestTitle).toBe('Active ongoing incidents');
    });

    test('prioritizes caller-provided filter.title as an override', () => {
        const customTitle = "This month's active incidents";
        const title = statusTabTitle({ value: 'active', label: 'Active incidents', title: customTitle }, true);
        expect(title).toBe(customTitle);
    });

    test('returns accurate descriptions for individual status filters and handles fallbacks', () => {
        expect(statusTabTitle({ value: 'verified' })).toBe('Verified reports');
        expect(statusTabTitle({ value: 'responding' })).toBe('Responding reports');
        expect(statusTabTitle({ value: 'transferred' })).toBe('Transferred reports');
        expect(statusTabTitle({ value: 'dispatch' })).toBe('Verified and transferred reports awaiting dispatch');
        expect(statusTabTitle({ value: 'resolved' })).toBe('Resolved reports');
        expect(statusTabTitle({ value: 'custom', label: 'Custom filter' })).toBe('Custom filter');
        expect(statusTabTitle(null)).toBe('Filter reports');
    });
});

describe('MapFilterRail component', () => {
    test('renders signed-in status tabs with accurate hover titles', () => {
        const onSelectFilter = vi.fn();
        const getCount = (value) => (value === 'active' ? 5 : value === 'pending' ? 2 : 7);

        render(
            <MapFilterRail
                filters={SIGNED_IN_FILTERS}
                showPendingReports={true}
                selectedFilter="all"
                onSelectFilter={onSelectFilter}
                getCount={getCount}
            />
        );

        const activeTab = screen.getByRole('button', { name: /Active incidents filter/i });
        expect(activeTab).toHaveAttribute('title', 'Verified, transferred, and responding reports');
        expect(activeTab).toHaveTextContent('5');

        const pendingTab = screen.getByRole('button', { name: /Pending review filter/i });
        expect(pendingTab).toHaveAttribute('title', 'Reports awaiting verification');
        expect(pendingTab).toHaveTextContent('2');

        const allTab = screen.getByRole('button', { name: /All open filter/i });
        expect(allTab).toHaveAttribute('title', 'All open reports (pending + being handled)');
        expect(allTab).toHaveAttribute('aria-pressed', 'true');

        const riskZonesTab = screen.getByRole('button', { name: /Risk zones layer/i });
        expect(riskZonesTab).toHaveAttribute('title', 'Toggle the mapped hazard layer');

        const resolvedTab = screen.getByRole('button', { name: /Resolved archive/i });
        expect(resolvedTab).toHaveAttribute('title', 'View the resolved incident archive');

        fireEvent.click(activeTab);
        expect(onSelectFilter).toHaveBeenCalledWith('active');
    });

    test('renders guest status tab with scope-aware tooltip', () => {
        render(
            <MapFilterRail
                filters={GUEST_FILTERS}
                showPendingReports={false}
                selectedFilter="all"
                onSelectFilter={vi.fn()}
                getCount={() => 3}
            />
        );

        const guestActiveTab = screen.getByRole('button', { name: /Active Incidents filter/i });
        expect(guestActiveTab).toHaveAttribute('title', 'Active ongoing incidents');
    });

    test('respects explicit filter.title overrides when rendered in the rail', () => {
        const filtersWithOverride = [
            {
                value: 'active',
                label: 'Active incidents',
                group: 'status',
                title: 'Custom caller override tooltip',
            },
        ];

        render(
            <MapFilterRail
                filters={filtersWithOverride}
                showPendingReports={true}
                selectedFilter="active"
                onSelectFilter={vi.fn()}
                getCount={() => 1}
            />
        );

        const tab = screen.getByRole('button', { name: /Active incidents filter/i });
        expect(tab).toHaveAttribute('title', 'Custom caller override tooltip');
    });
});
