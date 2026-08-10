import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineBadgeCheck,
    HiOutlineChevronDown,
    HiOutlineExclamationCircle,
    HiOutlineLightningBolt,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import IncidentLocationPreview from './IncidentLocationPreview';
import { IncidentSeverityIndicator, OperationalStatusIndicator } from './IncidentQueue';
import {
    getAgencyLabel,
    getIncidentCapabilities,
    getIncidentDate,
} from './incidentReportConfig';
import { formatIncidentLabel } from '../../utils/incidentDetails';
import { getReportUpdateMeta } from '../../utils/notificationNavigation';

const UPDATE_ALERT_STYLES = {
    red: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-100',
};

const formatDate = (value, pattern = 'PPpp') => {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : format(date, pattern);
};

const formatRelativeDate = (value, prefix) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${prefix} ${formatDistanceToNow(date, { addSuffix: true })}`;
};

const getRecordId = (record) => String(record?._id || record?.id || '');

const DetailItem = ({ label, children }) => (
    <div className="min-w-0 border-t border-gray-100 py-3 dark:border-gray-800">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">{children || 'Unavailable'}</dd>
    </div>
);

const Disclosure = ({ title, count, children }) => (
    <details className="group border-t border-gray-200 dark:border-gray-800">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-gray-900 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:text-gray-100 dark:hover:text-gray-300 [&::-webkit-details-marker]:hidden">
            <span>{title}{Number.isFinite(count) ? ` (${count})` : ''}</span>
            <HiOutlineChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="pb-5">{children}</div>
    </details>
);

const ResponderInspectorActions = ({ report, user, actions }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report.status === 'responding';

    if (!capabilities.canRespond && !capabilities.canResolve) return null;

    return (
        <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
            {capabilities.canRespond && (
                <button
                    type="button"
                    onClick={() => actions.openRespond(report)}
                    disabled={actions.respondLoadingId === report._id}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200 dark:focus-visible:ring-offset-gray-950"
                >
                    <HiOutlineLightningBolt className={`h-4 w-4 ${actions.respondLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    {isResponding ? 'Join response' : 'Respond to incident'}
                </button>
            )}

            {capabilities.canResolve && (
                <button
                    type="button"
                    onClick={() => actions.openResolve(report)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors duration-150 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 dark:focus-visible:ring-offset-gray-950"
                >
                    <HiOutlineBadgeCheck className="h-4 w-4" aria-hidden="true" />
                    Resolve incident
                </button>
            )}
        </footer>
    );
};

const ResponderIncidentInspector = ({
    report,
    user,
    actions,
    onClose,
    onOpenMap,
    onViewImage,
    detailLoading = false,
    detailError = '',
    detailRestricted = false,
    onRetryDetails,
    highlightedUpdateId = '',
    openedFromNotification = false,
}) => {
    const panelRef = useRef(null);
    const panelBodyRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previouslyFocusedRef = useRef(null);
    const [entered, setEntered] = useState(false);
    const isOpen = Boolean(report);
    const reportId = String(report?._id || report?.id || '');

    useEffect(() => {
        if (!isOpen) return undefined;

        previouslyFocusedRef.current = document.activeElement;
        const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKeyDown);
            const focusTarget = previouslyFocusedRef.current;
            if (focusTarget?.isConnected) focusTarget.focus();
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!reportId) return;
        const activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body && !panelRef.current?.contains(activeElement)) {
            previouslyFocusedRef.current = activeElement;
        }
    }, [reportId]);

    useLayoutEffect(() => {
        if (!reportId || !panelBodyRef.current) return;
        panelBodyRef.current.scrollTop = 0;
    }, [reportId]);

    useEffect(() => {
        if (!isOpen) {
            setEntered(false);
            return undefined;
        }

        const frame = window.requestAnimationFrame(() => setEntered(true));
        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    if (!report || typeof document === 'undefined') return null;

    const incidentDate = getIncidentDate(report);
    const incidentType = formatIncidentLabel(
        report.incidentType || report.accidentType || report.incidentCategory,
    );
    const municipality = report.municipalityName || report.municipality?.name || '';
    const locationTitle = report.address || [report.barangay, municipality].filter(Boolean).join(', ') || 'Incident details';
    const updates = Array.isArray(report.reportUpdates)
        ? [...report.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const effectiveHighlightedUpdateId = highlightedUpdateId || report.highlightedReporterUpdateId || '';
    const highlightedUpdate = updates.find((update) => getRecordId(update) === effectiveHighlightedUpdateId)
        || (report.hasUnreadReporterUpdate ? (report.latestReporterUpdate || updates[0]) : null)
        || (openedFromNotification ? updates[0] : null);
    const highlightedUpdateMeta = highlightedUpdate ? getReportUpdateMeta(highlightedUpdate.tag) : null;
    const transfers = Array.isArray(report.transferHistory)
        ? [...report.transferHistory].reverse()
        : [];
    const evidenceCount = Math.max(Number(report.evidenceCount) || 0, report.images?.length || 0);
    const responseStartedLabel = formatRelativeDate(report.respondedAt, 'Started');
    const resolvedLabel = formatRelativeDate(report.resolvedAt, 'Resolved');

    // MainLayout renders pages inside a transformed motion wrapper and a separate
    // scroll container. Portaling keeps this fixed panel viewport-bound instead of
    // allowing those ancestors to become its containing/clipping block.
    return createPortal(
        <aside
            id="responder-incident-inspector"
            ref={panelRef}
            className={`fixed inset-y-0 right-0 z-40 flex min-h-0 w-full flex-col overflow-hidden border-l border-gray-200 bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-950 md:w-[30rem] md:max-w-[calc(100vw-2rem)] ${entered ? 'translate-x-0' : 'translate-x-full'}`}
            role="dialog"
            aria-modal="false"
            aria-labelledby="responder-incident-details-title"
            data-testid="responder-incident-inspector"
        >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Incident details</p>
                    <h2 id="responder-incident-details-title" className="mt-1 line-clamp-2 break-words text-lg font-bold leading-6 text-gray-950 dark:text-white">
                        {locationTitle}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <IncidentSeverityIndicator severity={report.severity} />
                        <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">&middot;</span>
                        <OperationalStatusIndicator status={report.status} />
                    </div>
                </div>
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => onClose()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                    aria-label="Close incident details"
                >
                    <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                </button>
            </header>

            <div
                ref={panelBodyRef}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
                data-testid="incident-panel-scroll-body"
            >
                {detailLoading && (
                    <div className="mb-4 border-l-2 border-blue-400 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200" role="status">
                        Loading the protected operational record&hellip;
                    </div>
                )}

                {detailError && (
                    <div className="mb-4 border-l-2 border-red-500 bg-red-50 px-3 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert">
                        <div className="flex items-start gap-2">
                            <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <span>{detailError}</span>
                        </div>
                        {!detailRestricted && (
                            <button
                                type="button"
                                onClick={onRetryDetails}
                                className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/50"
                            >
                                <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                                Retry
                            </button>
                        )}
                    </div>
                )}

                {highlightedUpdate && highlightedUpdateMeta && (
                    <section
                        className={`mb-5 border-l-2 px-3 py-3 ${UPDATE_ALERT_STYLES[highlightedUpdateMeta.tone]}`}
                        aria-labelledby="responder-latest-update-heading"
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-75">Latest reporter update</p>
                        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                            <h3 id="responder-latest-update-heading" className="text-sm font-bold">{highlightedUpdateMeta.label}</h3>
                            {formatRelativeDate(highlightedUpdate.createdAt, '') && (
                                <time dateTime={new Date(highlightedUpdate.createdAt).toISOString()} className="text-xs opacity-75">
                                    {formatRelativeDate(highlightedUpdate.createdAt, '').trim()}
                                </time>
                            )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{highlightedUpdate.message}</p>
                        <p className="mt-2 border-t border-current/15 pt-2 text-xs font-medium opacity-75">
                            Reporter-provided information. Confirm it against the incident record before acting.
                        </p>
                    </section>
                )}

                <section aria-labelledby="responder-overview-heading">
                    <h3 id="responder-overview-heading" className="text-sm font-bold text-gray-950 dark:text-white">Overview</h3>
                    <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
                        <DetailItem label="Type"><span className="capitalize">{incidentType}</span></DetailItem>
                        <DetailItem label="Severity"><span className="capitalize">{report.severity || 'Moderate'}</span></DetailItem>
                        {report.fireInvolved && (
                            <DetailItem label="Fire">
                                Yes {report.fireType ? `(${report.fireType.replace('_', ' ')})` : ''}
                            </DetailItem>
                        )}
                        <DetailItem label="Incident time">{formatDate(incidentDate)}</DetailItem>
                        <DetailItem label="Municipality">{municipality}</DetailItem>
                        <DetailItem label="Submitted">{formatDate(report.createdAt)}</DetailItem>
                        {report.casualties && (report.casualties.injured > 0 || report.casualties.fatalities > 0 || report.casualties.missing > 0) && (
                            <DetailItem label="Casualties">
                                {[
                                    report.casualties.fatalities > 0 ? `${report.casualties.fatalities} fatal` : null,
                                    report.casualties.injured > 0 ? `${report.casualties.injured} injured` : null,
                                    report.casualties.missing > 0 ? `${report.casualties.missing} missing` : null,
                                ].filter(Boolean).join(', ')}
                            </DetailItem>
                        )}
                        <DetailItem label="Reporter">{report.reporter?.name || 'Unknown reporter'}</DetailItem>
                        <DetailItem label="Reporter account">{report.reporter?.isVerified ? 'Verified' : 'Not verified'}</DetailItem>
                    </dl>
                </section>

                <section className="border-t border-gray-200 py-5 dark:border-gray-800" aria-labelledby="responder-description-heading">
                    <h3 id="responder-description-heading" className="text-sm font-bold text-gray-950 dark:text-white">Description</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                        {report.description || 'No description provided.'}
                    </p>
                </section>

                <IncidentLocationPreview
                    report={report}
                    userRole={user?.role}
                    onOpenMap={onOpenMap}
                />

                {(report.respondedBy || report.status === 'resolved') && (
                    <section className="border-t border-gray-200 py-5 dark:border-gray-800" aria-labelledby="responder-response-heading">
                        <h3 id="responder-response-heading" className="text-sm font-bold text-gray-950 dark:text-white">Response record</h3>
                        <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)}
                            <span className="font-normal text-gray-500 dark:text-gray-400"> &middot; {report.respondedBy?.name || 'Assigned responder'}</span>
                        </p>
                        {(responseStartedLabel || resolvedLabel) && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {[responseStartedLabel, resolvedLabel].filter(Boolean).join(' · ')}
                            </p>
                        )}
                        {report.resolutionNotes && (
                            <p className="mt-3 border-l-2 border-gray-200 pl-3 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:text-gray-300">{report.resolutionNotes}</p>
                        )}
                    </section>
                )}

                {transfers.length > 0 && (
                    <Disclosure title="Transfer history" count={transfers.length}>
                        <ol className="divide-y divide-gray-100 dark:divide-gray-800">
                            {transfers.map((transfer, index) => (
                                <li key={getRecordId(transfer) || `${transfer.transferredAt}-${index}`} className="py-3 first:pt-0 last:pb-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {transfer.fromMunicipalityName || 'Previous municipality'} &rarr; {transfer.toMunicipalityName || 'Target municipality'}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                        Transferred {formatDate(transfer.transferredAt)}
                                        {transfer.transferredBy?.name ? ` by ${transfer.transferredBy.name}` : ''}
                                    </p>
                                    {transfer.reason && <p className="mt-2 text-sm leading-5 text-gray-700 dark:text-gray-300">{transfer.reason}</p>}
                                    <p className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                                        {transfer.acknowledgedAt ? `Acknowledged ${formatDate(transfer.acknowledgedAt)}` : 'Awaiting acknowledgment'}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </Disclosure>
                )}

                {updates.length > 0 && (
                    <Disclosure title="Reporter updates" count={updates.length}>
                        <ol className="divide-y divide-gray-100 dark:divide-gray-800">
                            {updates.map((item, index) => {
                                const isHighlighted = effectiveHighlightedUpdateId && getRecordId(item) === effectiveHighlightedUpdateId;
                                return (
                                    <li
                                        key={getRecordId(item) || `${item.createdAt || 'update'}-${index}`}
                                        className={`py-3 first:pt-0 last:pb-0 ${isHighlighted ? 'border-l-2 border-brand-400 pl-3' : ''}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{item.author?.name || 'Reporter'}</span>
                                            {item.tag && <span className="capitalize">{item.tag.replace('_', ' ')}</span>}
                                            {formatRelativeDate(item.createdAt, '') && <span>{formatRelativeDate(item.createdAt, '').trim()}</span>}
                                        </div>
                                        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-gray-700 dark:text-gray-300">{item.message}</p>
                                    </li>
                                );
                            })}
                        </ol>
                    </Disclosure>
                )}

                {report.detailCompleteness === 'full' && (
                    <Disclosure title="Evidence photos" count={evidenceCount}>
                        <ProtectedEvidenceGallery images={report.images || []} onViewImage={onViewImage} />
                    </Disclosure>
                )}
            </div>

            <ResponderInspectorActions report={report} user={user} actions={actions} />
        </aside>,
        document.body,
    );
};

export default ResponderIncidentInspector;
