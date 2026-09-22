import { formatDistanceToNow } from 'date-fns';
import { HiOutlineCloudUpload, HiOutlineExclamationCircle } from 'react-icons/hi';
import Button from '../ui/Button';
import { QUEUE_BLOCKED_CODES } from '../../utils/offlineReportQueue';

/**
 * The one place a queued report is visible to its reporter.
 *
 * Two states, deliberately separated: what the queue is still trying to deliver
 * on its own, and what it cannot deliver without an answer. The second group is
 * why this component exists — a blocked report used to be invisible, because the
 * banner only counted it and promised an automatic retry that never came, so a
 * report the server had refused sat on the device with no reason shown and no
 * way to clear it.
 */
const OfflineQueueBanner = ({
    pendingCount = 0,
    deliverableCount = 0,
    blockedReports = [],
    isOnline = true,
    isSyncing = false,
    onSync,
    onResolveBlocked,
    onDiscard,
}) => {
    const hasBlocked = blockedReports.length > 0;
    if (pendingCount <= 0 && !hasBlocked) return null;

    // Only promise a retry that can actually happen: with nothing deliverable
    // and something waiting on the reporter, the honest status is "your move".
    const statusCopy = hasBlocked && deliverableCount === 0
        ? 'Saved locally while offline. Nothing can be sent automatically — review the report below.'
        : `Saved locally while offline. ${isOnline
            ? 'Retrying automatically — you can also Sync now.'
            : 'Will automatically sync when internet connection returns.'}`;

    return (
        <div
            role="region"
            aria-label="Offline queued reports"
            className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <HiOutlineCloudUpload className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <div>
                        {pendingCount > 0 && (
                            <p className="text-sm font-semibold">
                                {pendingCount} incident {pendingCount === 1 ? 'report is' : 'reports are'} queued on this device
                            </p>
                        )}
                        <p className={pendingCount > 0
                            ? 'mt-0.5 text-xs text-amber-700 dark:text-amber-300'
                            : 'text-sm font-semibold'}
                        >
                            {statusCopy}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="primary"
                        size="sm"
                        className="rounded-md bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                        onClick={() => onSync?.()}
                        disabled={isSyncing || !isOnline || deliverableCount === 0}
                    >
                        {isSyncing ? 'Syncing reports…' : 'Sync now'}
                    </Button>
                </div>
            </div>

            {hasBlocked && (
                <ul
                    aria-label="Reports waiting on you"
                    className="flex flex-col gap-3 border-t border-amber-300/70 pt-3 dark:border-amber-700/40"
                >
                    {blockedReports.map((report) => {
                        const isDuplicate = report.blockedCode === QUEUE_BLOCKED_CODES.duplicate;

                        return (
                            <li
                                key={report.clientReportId}
                                className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
                            >
                                <div className="flex items-start gap-3">
                                    <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold">{report.label}</p>
                                        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{report.blockedReason}</p>
                                        {report.queuedAt && (
                                            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">
                                                Queued {formatDistanceToNow(new Date(report.queuedAt), { addSuffix: true })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        className="rounded-md bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                                        aria-label={isDuplicate
                                            ? `This is a different incident: ${report.label}`
                                            : `Try again: ${report.label}`}
                                        onClick={() => onResolveBlocked?.(
                                            report.clientReportId,
                                            isDuplicate ? { confirmDistinct: true } : undefined,
                                        )}
                                        disabled={isSyncing || !isOnline}
                                    >
                                        {isDuplicate ? 'This is a different incident' : 'Try again'}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="rounded-md"
                                        aria-label={`Discard: ${report.label}`}
                                        onClick={() => onDiscard?.(report.clientReportId)}
                                        disabled={isSyncing}
                                    >
                                        Discard
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default OfflineQueueBanner;
