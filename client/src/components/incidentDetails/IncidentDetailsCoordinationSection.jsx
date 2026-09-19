import { format, formatDistanceToNow } from 'date-fns';
import { HiOutlineChevronDown, HiOutlineClock, HiOutlineSwitchHorizontal, HiOutlineTruck } from 'react-icons/hi';

const AGENCY_LABELS = {
    pnp: 'Philippine National Police',
    bfp: 'Bureau of Fire Protection',
    mdrrmo: 'MDRRMO Rescue',
    rhu: 'Rural Health Unit',
    rhui: 'Rural Health Unit',
    coastguard: 'Philippine Coast Guard',
};

const getAgencyLabel = (agency) => (
    AGENCY_LABELS[agency?.toLowerCase()] || agency || 'Emergency services'
);

const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : format(date, 'MMM d, yyyy, h:mm a');
};

const formatRelativeDate = (value, prefix = '') => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const relative = formatDistanceToNow(date, { addSuffix: true });
    return prefix ? `${prefix} ${relative}` : relative;
};

const getRecordId = (record) => String(record?._id || record?.id || '');

const IncidentDetailsCoordinationSection = ({
    report = {},
    showTransfers = false,
    highlightedUpdateId = '',
    className = '',
}) => {
    const hasResponse = Boolean(report.respondedBy || report.status === 'resolved' || report.responderAgency);
    const updates = Array.isArray(report.reportUpdates)
        ? [...report.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const transfers = Array.isArray(report.transferHistory)
        ? [...report.transferHistory].reverse()
        : [];

    const responseStartedLabel = formatRelativeDate(report.respondedAt, 'Started');
    const resolvedLabel = formatRelativeDate(report.resolvedAt, 'Resolved');

    if (!hasResponse && updates.length === 0 && (!showTransfers || transfers.length === 0)) {
        return null;
    }

    return (
        <section className={`space-y-3 ${className}`} aria-labelledby="incident-coordination-heading">
            <h3 id="incident-coordination-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                Response coordination
            </h3>

            {hasResponse && (
                <div className="rounded-xl border border-gray-200/80 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-2">
                        <HiOutlineTruck className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                        <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}
                        </span>
                        {report.respondedBy?.name && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                &middot; {report.respondedBy.name}
                            </span>
                        )}
                    </div>
                    {(responseStartedLabel || resolvedLabel) && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {[responseStartedLabel, resolvedLabel].filter(Boolean).join(' · ')}
                        </p>
                    )}
                    {report.resolutionNotes && (
                        <p className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5 text-xs leading-relaxed text-gray-700 dark:border-white/10 dark:bg-[#07130e] dark:text-gray-300">
                            {report.resolutionNotes}
                        </p>
                    )}
                </div>
            )}

            {showTransfers && transfers.length > 0 && (
                <details className="group rounded-xl border border-gray-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#07130e]/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                            <HiOutlineSwitchHorizontal className="h-4 w-4 text-blue-500" aria-hidden="true" />
                            Transfer history ({transfers.length})
                        </span>
                        <HiOutlineChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" aria-hidden="true" />
                    </summary>
                    <ol className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2 dark:divide-gray-800 dark:border-white/5">
                        {transfers.map((transfer, index) => (
                            <li key={getRecordId(transfer) || `${transfer.transferredAt}-${index}`} className="py-2.5 first:pt-0 last:pb-0">
                                <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {transfer.fromMunicipalityName || 'Previous municipality'} &rarr; {transfer.toMunicipalityName || 'Target municipality'}
                                </p>
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                    Transferred {formatDate(transfer.transferredAt)}
                                    {transfer.transferredBy?.name ? ` by ${transfer.transferredBy.name}` : ''}
                                </p>
                                {transfer.reason && (
                                    <p className="mt-1.5 text-xs leading-5 text-gray-700 dark:text-gray-300">{transfer.reason}</p>
                                )}
                                <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                    {transfer.acknowledgedAt ? `Acknowledged ${formatDate(transfer.acknowledgedAt)}` : 'Awaiting acknowledgment'}
                                </p>
                            </li>
                        ))}
                    </ol>
                </details>
            )}

            {updates.length > 0 && (
                <details className="group rounded-xl border border-gray-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#07130e]/40" open>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">
                            <HiOutlineClock className="h-4 w-4 text-brand-600 dark:text-sky-400" aria-hidden="true" />
                            Situation updates ({updates.length})
                        </span>
                        <HiOutlineChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180 dark:text-gray-500" aria-hidden="true" />
                    </summary>
                    <ol className="mt-3 divide-y divide-gray-100 border-t border-gray-100 pt-2 dark:divide-gray-800 dark:border-white/5">
                        {updates.map((item, index) => {
                            const isHighlighted = highlightedUpdateId && getRecordId(item) === highlightedUpdateId;
                            return (
                                <li
                                    key={getRecordId(item) || `${item.createdAt || 'update'}-${index}`}
                                    className={`py-2.5 first:pt-0 last:pb-0 ${isHighlighted ? 'border-l-2 border-brand-500 pl-3' : ''}`}
                                >
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="font-semibold text-gray-900 dark:text-gray-100">{item.author?.name || 'Reporter'}</span>
                                        {item.tag && <span className="capitalize text-gray-600 dark:text-gray-300">({item.tag.replace(/_/g, ' ')})</span>}
                                        {formatRelativeDate(item.createdAt, '') && <span>{formatRelativeDate(item.createdAt, '').trim()}</span>}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">{item.message}</p>
                                </li>
                            );
                        })}
                    </ol>
                </details>
            )}
        </section>
    );
};

export default IncidentDetailsCoordinationSection;
