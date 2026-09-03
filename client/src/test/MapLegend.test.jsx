import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import MapLegend from '../components/map/MapLegend';
import { isRiskZoneLayerVisibleForFilter, MAP_RISK_ZONE_CONFIG, MAP_STATUS_CONFIG } from '../config/mapVisuals';

describe('MapLegend', () => {
    test('keeps danger and lifecycle colors semantically distinct', () => {
        const lifecycleColors = Object.values(MAP_STATUS_CONFIG).map(({ markerColor }) => markerColor);

        expect(new Set(lifecycleColors).size).toBe(lifecycleColors.length);
        expect(lifecycleColors).not.toContain(MAP_RISK_ZONE_CONFIG.markerColor);
        expect(MAP_STATUS_CONFIG.responding.markerColor).toBe('#0891B2');
        expect(MAP_STATUS_CONFIG.rejected.markerColor).toBe('#64748B');
    });

    test('shows only public active statuses when pending reports are hidden', () => {
        render(<MapLegend />);

        expect(screen.getByText('High-risk zone')).toBeInTheDocument();
        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.getByText('Responding')).toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });

    test('isolates the pending filter and hides the hazard indicator', () => {
        render(<MapLegend showPending filterStatus="pending" hasGroupedReports />);

        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.getByText('Multiple incidents')).toBeInTheDocument();
    });

    test('does not show pending status in public mode even if pending filter is given without showPending', () => {
        render(<MapLegend filterStatus="pending" filterMode="public" />);

        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
    });

    test('shows only verified status for the verified filter and hides the hazard indicator', () => {
        render(<MapLegend filterStatus="verified" />);

        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
    });

    test('shows only transferred status for the transferred filter and hides the hazard indicator', () => {
        render(<MapLegend filterStatus="transferred" />);

        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
    });

    test('exposes the hazard layer only for aggregate and hazard filters', () => {
        expect(isRiskZoneLayerVisibleForFilter(null)).toBe(true);
        expect(isRiskZoneLayerVisibleForFilter('all')).toBe(true);
        expect(isRiskZoneLayerVisibleForFilter('risk-zones')).toBe(true);
        expect(isRiskZoneLayerVisibleForFilter('incidents')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('pending')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('verified')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('responding')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('transferred')).toBe(false);
        expect(isRiskZoneLayerVisibleForFilter('resolved')).toBe(false);
    });

    test('hides the hazard indicator for the incidents-only filter', () => {
        render(<MapLegend filterStatus="incidents" />);

        expect(screen.queryByText('High-risk zone')).not.toBeInTheDocument();
        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText('Responding')).toBeInTheDocument();
    });

    test('shows only high-risk zone for the risk-zones filter', () => {
        render(<MapLegend filterStatus="risk-zones" />);

        expect(screen.getByText('High-risk zone')).toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
    });

    test('opens and closes the accessible mobile legend popover', () => {
        render(<MapLegend showPending />);
        const trigger = screen.getByRole('button', { name: 'Map legend' });

        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('region', { name: 'Map legend details' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    test('hides incident status indicators when showIncidentStatus is false', () => {
        render(<MapLegend showIncidentStatus={false} />);

        expect(screen.getByText('High-risk zone')).toBeInTheDocument();
        expect(screen.queryByText('Verified')).not.toBeInTheDocument();
        expect(screen.queryByText('Transferred')).not.toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    });

    test('allows collapsing and expanding the desktop legend', () => {
        render(<MapLegend />);
        expect(screen.getByRole('region', { name: 'Map legend' })).toBeInTheDocument();

        const collapseBtn = screen.getByRole('button', { name: 'Collapse map legend' });
        fireEvent.click(collapseBtn);

        expect(screen.queryByRole('region', { name: 'Map legend' })).not.toBeInTheDocument();
        const expandBtn = screen.getByRole('button', { name: 'Expand map legend' });
        expect(expandBtn).toBeInTheDocument();

        fireEvent.click(expandBtn);
        expect(screen.getByRole('region', { name: 'Map legend' })).toBeInTheDocument();
    });
});

