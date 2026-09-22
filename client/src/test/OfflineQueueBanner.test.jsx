import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import OfflineQueueBanner from '../components/reporterReports/OfflineQueueBanner';
import { QUEUE_BLOCKED_CODES } from '../utils/offlineReportQueue';

const blockedDuplicate = {
    clientReportId: 'rep-dupe',
    blockedCode: QUEUE_BLOCKED_CODES.duplicate,
    blockedReason: 'A similar incident was already reported nearby.',
    queuedAt: Date.now(),
    label: 'Poblacion coastal road',
};

const blockedRejection = {
    clientReportId: 'rep-rejected',
    blockedCode: QUEUE_BLOCKED_CODES.rejected,
    blockedReason: 'Address is outside Sibuyan Island',
    queuedAt: Date.now(),
    label: 'Somewhere offshore',
};

describe('OfflineQueueBanner', () => {
    test('renders nothing when the device holds no queued report', () => {
        const { container } = render(<OfflineQueueBanner pendingCount={0} />);

        expect(container).toBeEmptyDOMElement();
    });

    test('counts what is still being retried and offers a manual sync', () => {
        const onSync = vi.fn();

        render(<OfflineQueueBanner pendingCount={2} deliverableCount={2} isOnline onSync={onSync} />);

        expect(screen.getByText(/2 incident reports are queued on this device/i)).toBeInTheDocument();
        expect(screen.getByText(/Retrying automatically/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Sync now/i }));
        expect(onSync).toHaveBeenCalledTimes(1);
    });

    test('names a singular queued report in the singular', () => {
        render(<OfflineQueueBanner pendingCount={1} deliverableCount={1} isOnline />);

        expect(screen.getByText(/1 incident report is queued on this device/i)).toBeInTheDocument();
    });

    test('stops promising an automatic retry once only the reporter can unblock it', () => {
        render(<OfflineQueueBanner pendingCount={1} deliverableCount={0} isOnline blockedReports={[blockedDuplicate]} />);

        expect(screen.getByText(/Nothing can be sent automatically/i)).toBeInTheDocument();
        expect(screen.queryByText(/Retrying automatically/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sync now/i })).toBeDisabled();
    });

    test('offers the duplicate the confirmation only the reporter can give', () => {
        const onResolveBlocked = vi.fn();

        render(
            <OfflineQueueBanner
                pendingCount={1}
                deliverableCount={0}
                isOnline
                blockedReports={[blockedDuplicate]}
                onResolveBlocked={onResolveBlocked}
            />,
        );

        expect(screen.getByText('A similar incident was already reported nearby.')).toBeInTheDocument();
        expect(screen.getByText('Poblacion coastal road')).toBeInTheDocument();
        expect(screen.getByText(/Queued less than a minute ago/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /This is a different incident/i }));
        expect(onResolveBlocked).toHaveBeenCalledWith('rep-dupe', { confirmDistinct: true });
    });

    test('offers a plain rejection a retry, and both kinds a way out', () => {
        const onResolveBlocked = vi.fn();
        const onDiscard = vi.fn();

        render(
            <OfflineQueueBanner
                pendingCount={2}
                deliverableCount={0}
                isOnline
                blockedReports={[blockedRejection, blockedDuplicate]}
                onResolveBlocked={onResolveBlocked}
                onDiscard={onDiscard}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
        expect(onResolveBlocked).toHaveBeenCalledWith('rep-rejected', undefined);

        fireEvent.click(screen.getByRole('button', { name: /Discard: Poblacion coastal road/i }));
        expect(onDiscard).toHaveBeenCalledWith('rep-dupe');
    });

    test('cannot be synced while the device is offline', () => {
        render(<OfflineQueueBanner pendingCount={1} deliverableCount={1} isOnline={false} />);

        expect(screen.getByRole('button', { name: /Sync now/i })).toBeDisabled();
        expect(screen.getByText(/Will automatically sync when internet connection returns/i)).toBeInTheDocument();
    });
});
