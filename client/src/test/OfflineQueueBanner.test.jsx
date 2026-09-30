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

const blockedGpsAccuracy = {
    clientReportId: 'rep-gps',
    blockedCode: QUEUE_BLOCKED_CODES.rejected,
    blockedReason: 'GPS accuracy must be 100 meters or better. Please retry GPS or pin the incident on the map.',
    queuedAt: Date.now(),
    label: 'Cajidiocan Port',
    coordinates: { lat: 12.3, lng: 122.1 },
};

const blockedMunicipality = {
    clientReportId: 'rep-muni',
    blockedCode: QUEUE_BLOCKED_CODES.rejected,
    blockedReason: 'The incident location could not be assigned safely to a municipality.',
    queuedAt: Date.now(),
    label: 'Boundary waters',
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

    test('explains a plain rejection instead of offering a retry that cannot succeed', () => {
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

        // The stored payload is byte-for-byte what the server refused, so a
        // blind retry would only buy a second rejection.
        expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();
        expect(screen.getByText(/the queue cannot fix/i)).toBeInTheDocument();
        expect(screen.getByText('Address is outside Sibuyan Island')).toBeInTheDocument();

        // The duplicate still gets the one question only the reporter can answer.
        fireEvent.click(screen.getByRole('button', { name: /This is a different incident/i }));
        expect(onResolveBlocked).toHaveBeenCalledWith('rep-dupe', { confirmDistinct: true });

        fireEvent.click(screen.getByRole('button', { name: /Discard: Poblacion coastal road/i }));
        expect(onDiscard).toHaveBeenCalledWith('rep-dupe');
    });

    test('offers a GPS-accuracy rejection a location fix, even while offline', () => {
        const onFixLocation = vi.fn();

        render(
            <OfflineQueueBanner
                pendingCount={1}
                deliverableCount={0}
                isOnline={false}
                blockedReports={[blockedGpsAccuracy]}
                onFixLocation={onFixLocation}
            />,
        );

        expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();

        // Correcting the location is a local save, so it stays available
        // without a connection.
        const fixButton = screen.getByRole('button', { name: /Fix location: Cajidiocan Port/i });
        expect(fixButton).toBeEnabled();
        fireEvent.click(fixButton);
        expect(onFixLocation).toHaveBeenCalledWith('rep-gps');
    });

    test('tells the reporter exactly what to do about a municipality mismatch', () => {
        render(
            <OfflineQueueBanner
                pendingCount={1}
                deliverableCount={0}
                isOnline
                blockedReports={[blockedMunicipality]}
            />,
        );

        expect(screen.getByText(/move the pin moved away from the boundary|moved away from the boundary/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Discard: Boundary waters/i })).toBeInTheDocument();
    });

    test('cannot be synced while the device is offline', () => {
        render(<OfflineQueueBanner pendingCount={1} deliverableCount={1} isOnline={false} />);

        expect(screen.getByRole('button', { name: /Sync now/i })).toBeDisabled();
        expect(screen.getByText(/Will automatically sync when internet connection returns/i)).toBeInTheDocument();
    });
});
