import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import MapLegend from '../components/map/MapLegend';
import { MAP_RISK_ZONE_CONFIG, MAP_STATUS_CONFIG } from '../config/mapVisuals';

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

    test('uses the exact awaiting-filter statuses and grouped marker guidance', () => {
        render(<MapLegend showPending filterStatus="pending" hasGroupedReports />);

        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('Verified')).toBeInTheDocument();
        expect(screen.getByText('Transferred')).toBeInTheDocument();
        expect(screen.queryByText('Responding')).not.toBeInTheDocument();
        expect(screen.getByText('Multiple incidents')).toBeInTheDocument();
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
});
