import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../components/ui/Modal', () => ({
    default: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock('../components/ResponderUnitModal', () => ({
    default: ({ isOpen }) => (isOpen ? <div data-testid="unit-modal" /> : null),
}));

import { IncidentActionButtons } from '../components/adminReports/IncidentQueue';
import IncidentActionDialogs from '../components/adminReports/IncidentActionDialogs';
import useIncidentActions from '../hooks/useIncidentActions';

const responderUser = { _id: 'responder-1', role: 'responder', assignedMunicipality: 'Cajidiocan' };

const pendingReport = (overrides = {}) => ({
    _id: 'report-1',
    status: 'pending',
    municipalityName: 'Cajidiocan',
    address: 'Poblacion, Cajidiocan',
    description: 'Vehicle off the road',
    casualties: { injured: 0, fatalities: 0, missing: 0 },
    responders: [],
    ...overrides,
});

describe('self-dispatch countdown on the queue actions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-31T10:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const renderActions = (report) => render(
        <IncidentActionButtons
            report={report}
            user={responderUser}
            actions={{ respondLoadingId: null, openRespond: vi.fn() }}
            onInspect={() => {}}
        />,
    );

    test('a no-casualty pending report shows a disabled countdown instead of Respond', () => {
        renderActions(pendingReport({ selfDispatchOpensAt: '2026-10-31T10:02:30.000Z' }));

        const countdown = screen.getByRole('button', { name: /Available in 2:30/ });
        expect(countdown).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Respond to incident/ })).toBeNull();
    });

    test('null casualty counts also wait (unknown never opens the immediate path)', () => {
        renderActions(pendingReport({
            casualties: { injured: null, fatalities: null, missing: null },
            selfDispatchOpensAt: '2026-10-31T10:02:30.000Z',
        }));

        expect(screen.getByRole('button', { name: /Available in 2:30/ })).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Respond to incident/ })).toBeNull();
    });

    test('Respond enables in place when the window opens, with no reload', () => {
        renderActions(pendingReport({ selfDispatchOpensAt: '2026-10-31T10:01:05.000Z' }));
        expect(screen.getByRole('button', { name: /Available in 1:05/ })).toBeDisabled();

        act(() => { vi.advanceTimersByTime(66_000); });

        expect(screen.queryByRole('button', { name: /Available in/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Respond to incident/ })).toBeEnabled();
    });

    test('a casualty report can be responded to immediately, countdown or not', () => {
        renderActions(pendingReport({
            casualties: { injured: 1, fatalities: 0, missing: 0 },
            selfDispatchOpensAt: '2026-10-31T10:02:30.000Z',
        }));

        expect(screen.getByRole('button', { name: /Respond to incident/ })).toBeEnabled();
        expect(screen.queryByRole('button', { name: /Available in/ })).toBeNull();
    });
});

describe('unverified respond confirmation', () => {
    let latestActions = null;

    const Harness = () => {
        const actions = useIncidentActions({
            user: responderUser,
            patchReport: vi.fn(),
            removeReport: vi.fn(),
            refreshReports: vi.fn().mockResolvedValue(undefined),
            closeDetails: vi.fn(),
        });
        latestActions = actions;
        return <IncidentActionDialogs actions={actions} municipality="Cajidiocan" />;
    };

    test('responding to an unverified report asks first, then continues to unit selection', () => {
        render(<Harness />);
        const report = pendingReport({ casualties: { injured: 1, fatalities: 0, missing: 0 } });

        act(() => { latestActions.openRespond(report); });

        expect(screen.getByText('This report has not been verified by an admin yet. Respond anyway?')).toBeTruthy();
        expect(screen.queryByTestId('unit-modal')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Respond anyway' }));

        expect(screen.queryByText('This report has not been verified by an admin yet. Respond anyway?')).toBeNull();
        expect(screen.getByTestId('unit-modal')).toBeTruthy();
    });

    test('cancelling the confirmation starts nothing', () => {
        render(<Harness />);
        const report = pendingReport({ casualties: { injured: 1, fatalities: 0, missing: 0 } });

        act(() => { latestActions.openRespond(report); });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByText('This report has not been verified by an admin yet. Respond anyway?')).toBeNull();
        expect(screen.queryByTestId('unit-modal')).toBeNull();
    });

    test('a verified report goes straight to unit selection, no confirmation', () => {
        render(<Harness />);
        const report = pendingReport({
            status: 'verified',
            verifiedAt: '2026-10-31T09:55:00.000Z',
            selfDispatchOpensAt: null,
        });

        act(() => { latestActions.openRespond(report); });

        expect(screen.queryByText('This report has not been verified by an admin yet. Respond anyway?')).toBeNull();
        expect(screen.getByTestId('unit-modal')).toBeTruthy();
    });
});
