import { useEffect, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineExclamationCircle,
    HiOutlineExternalLink,
    HiOutlineLocationMarker,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';
import MapView from '../map/MapView';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import { IncidentActionButtons, IncidentStatusBadge } from './IncidentQueue';
import {
    getAgencyLabel,
    getCoordinates,
    getIncidentDate,
    SEVERITY_STYLES,
} from './incidentReportConfig';
import { getReportUpdateMeta } from '../../utils/notificationNavigation';

const UPDATE_ALERT_STYLES = {
    red: 'border-red-200 bg-red-50 text-red-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
};

const formatDate = (value, pattern = 'PPpp') => {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : format(date, pattern);
};

const DetailItem = ({ label, children }) => (
    <div>
        <dt className="text-xs font-medium text-gray-500">{label}</dt>
        <dd className="mt-1 text-sm font-medium text-gray-900">{children || 'Unavailable'}</dd>
    </div>
);

const IncidentDetailsDrawer = ({
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
    const closeButtonRef = useRef(null);
    const drawerRef = useRef(null);
    const previouslyFocusedRef = useRef(null);
    const coordinates = getCoordinates(report);

    useEffect(() => {
        if (!report) return undefined;
        previouslyFocusedRef.current = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
            if (event.key !== 'Tab') return;

            const focusable = drawerRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            previouslyFocusedRef.current?.focus?.();
        };
    }, [onClose, report]);

    if (!report) return null;

    const incidentDate = getIncidentDate(report);
    const updates = Array.isArray(report.reportUpdates)
        ? [...report.reportUpdates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const effectiveHighlightedUpdateId = highlightedUpdateId || report.highlightedReporterUpdateId || '';
    const highlightedUpdate = updates.find((update) => String(update._id) === effectiveHighlightedUpdateId)
        || (report.hasUnreadReporterUpdate ? (report.latestReporterUpdate || updates[0]) : null)
        || (openedFromNotification ? updates[0] : null);
    const highlightedUpdateMeta = highlightedUpdate ? getReportUpdateMeta(highlightedUpdate.tag) : null;
    const highlightedUpdateDate = highlightedUpdate?.createdAt ? new Date(highlightedUpdate.createdAt) : null;
    const hasValidHighlightedUpdateDate = highlightedUpdateDate && !Number.isNaN(highlightedUpdateDate.getTime());
    const transfers = Array.isArray(report.transferHistory)
        ? [...report.transferHistory].reverse()
        : [];

    return (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="incident-details-title">
            <button type="button" tabIndex={-1} className="absolute inset-0 bg-gray-950/45" onClick={() => onClose()} aria-label="Close incident details" />
            <aside ref={drawerRef} className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-xl">
                <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Incident record</p>
                        <h2 id="incident-details-title" className="mt-1 line-clamp-2 break-words text-lg font-bold text-gray-950">
                            {report.address || 'Incident details'}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <IncidentStatusBadge status={report.status} />
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${SEVERITY_STYLES[report.severity] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                                {report.severity || 'Unspecified'} severity
                            </span>
                        </div>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={() => onClose()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        aria-label="Close incident details"
                    >
                        <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                    {detailLoading && (
                        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" role="status">
                            Loading the protected operational record...
                        </div>
                    )}

                    {detailError && (
                        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
                            <span className="flex items-start gap-2">
                                <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                {detailError}
                            </span>
                            {!detailRestricted && (
                                <button
                                    type="button"
                                    onClick={onRetryDetails}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-red-100"
                                >
                                    <HiOutlineRefresh className="h-4 w-4" aria-hidden="true" />
                                    Retry
                                </button>
                            )}
                        </div>
                    )}

                    {highlightedUpdate && highlightedUpdateMeta && (
                        <section
                            className={`mb-5 rounded-xl border p-4 ${UPDATE_ALERT_STYLES[highlightedUpdateMeta.tone]}`}
                            aria-labelledby="latest-reporter-update-heading"
                        >
                            <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Latest reporter update</p>
                                    <h3 id="latest-reporter-update-heading" className="mt-1 text-sm font-bold">{highlightedUpdateMeta.label}</h3>
                                </div>
                                {hasValidHighlightedUpdateDate && (
                                    <time dateTime={highlightedUpdateDate.toISOString()} className="shrink-0 text-xs opacity-75">
                                        {formatDistanceToNow(highlightedUpdateDate, { addSuffix: true })}
                                    </time>
                                )}
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{highlightedUpdate.message}</p>
                            <p className="mt-3 border-t border-current/15 pt-2 text-xs font-medium opacity-75">
                                Reporter-provided information. Review it with the incident record before taking an administrative action.
                            </p>
                        </section>
                    )}

                    <section aria-labelledby="incident-overview-heading">
                        <h3 id="incident-overview-heading" className="text-sm font-bold text-gray-900">Incident overview</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
                            <DetailItem label="Type"><span className="capitalize">{report.incidentType || report.accidentType || report.incidentCategory}</span></DetailItem>
                            <DetailItem label="Incident time">{formatDate(incidentDate)}</DetailItem>
                            <DetailItem label="Municipality">{report.municipalityName || report.municipality?.name}</DetailItem>
                            <DetailItem label="Submitted">{formatDate(report.createdAt)}</DetailItem>
                            <DetailItem label="Reporter">{report.reporter?.name || 'Unknown reporter'}</DetailItem>
                            <DetailItem label="Reporter account">{report.reporter?.isVerified ? 'Verified' : 'Not verified'}</DetailItem>
                        </dl>
                    </section>

                    <section className="mt-5" aria-labelledby="incident-description-heading">
                        <h3 id="incident-description-heading" className="text-sm font-bold text-gray-900">Description</h3>
                        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-gray-200 p-4 text-sm leading-6 text-gray-700">
                            {report.description || 'No description provided.'}
                        </p>
                    </section>

                    {transfers.length > 0 && (
                        <section className="mt-5" aria-labelledby="transfer-history-heading">
                            <h3 id="transfer-history-heading" className="text-sm font-bold text-gray-900">Transfer history</h3>
                            <ol className="mt-3 space-y-3">
                                {transfers.map((transfer, index) => (
                                    <li key={transfer._id || `${transfer.transferredAt}-${index}`} className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                                        <div className="flex flex-col gap-2 min-[360px]:flex-row min-[360px]:items-start min-[360px]:justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-violet-950">
                                                    {transfer.fromMunicipalityName || 'Previous municipality'} → {transfer.toMunicipalityName || 'Target municipality'}
                                                </p>
                                                <p className="mt-1 text-xs text-violet-700">
                                                    Transferred {formatDate(transfer.transferredAt)}
                                                    {transfer.transferredBy?.name ? ` by ${transfer.transferredBy.name}` : ''}
                                                </p>
                                            </div>
                                            {transfer.acknowledgedAt ? (
                                                <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Acknowledged</span>
                                            ) : (
                                                <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Awaiting acknowledgment</span>
                                            )}
                                        </div>
                                        <p className="mt-3 border-t border-violet-200 pt-3 text-sm text-violet-900">{transfer.reason}</p>
                                        {transfer.acknowledgedAt && (
                                            <p className="mt-2 text-xs text-emerald-700">
                                                Acknowledged {formatDate(transfer.acknowledgedAt)}
                                                {transfer.acknowledgedBy?.name ? ` by ${transfer.acknowledgedBy.name}` : ''}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {coordinates && (
                        <section className="mt-5" aria-labelledby="incident-location-heading">
                            <div className="flex flex-col gap-3 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
                                <div>
                                    <h3 id="incident-location-heading" className="text-sm font-bold text-gray-900">Pinned location</h3>
                                    <p className="mt-0.5 text-xs text-gray-500">{coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOpenMap(report)}
                                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 min-[360px]:w-auto"
                                >
                                    <HiOutlineExternalLink className="h-4 w-4" aria-hidden="true" />
                                    Open full map
                                </button>
                            </div>
                            <div className="mt-3 aspect-square w-full overflow-hidden rounded-xl border border-gray-200 sm:aspect-auto sm:h-56">
                                <MapView
                                    reports={[report]}
                                    showPending
                                    focusLocation={{ ...coordinates, zoom: 16 }}
                                    className="h-full w-full"
                                />
                            </div>
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
                                <HiOutlineLocationMarker className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                {report.address}
                            </p>
                        </section>
                    )}

                    {(report.respondedBy || report.status === 'resolved') && (
                        <section className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-labelledby="incident-response-heading">
                            <h3 id="incident-response-heading" className="text-sm font-bold text-blue-950">Response record</h3>
                            <p className="mt-2 text-sm text-blue-900">
                                {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)} · {report.respondedBy?.name || 'Assigned responder'}
                            </p>
                            {report.respondedAt && <p className="mt-1 text-xs text-blue-700">Response started {formatDistanceToNow(new Date(report.respondedAt), { addSuffix: true })}</p>}
                            {report.resolvedAt && <p className="mt-1 text-xs text-blue-700">Resolved {formatDistanceToNow(new Date(report.resolvedAt), { addSuffix: true })}</p>}
                            {report.resolutionNotes && <p className="mt-3 border-t border-blue-200 pt-3 text-sm text-blue-900">{report.resolutionNotes}</p>}
                        </section>
                    )}

                    {updates.length > 0 && (
                        <section className="mt-5" aria-labelledby="incident-updates-heading">
                            <h3 id="incident-updates-heading" className="text-sm font-bold text-gray-900">Reporter updates</h3>
                            <ol className="mt-3 space-y-2">
                                {updates.map((item, index) => (
                                    <li
                                        key={`${item.createdAt || 'update'}-${index}`}
                                        className={`rounded-xl border border-gray-200 p-3 ${effectiveHighlightedUpdateId && String(item._id) === effectiveHighlightedUpdateId ? 'bg-brand-50 ring-2 ring-brand-500/20' : ''}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                            <span className="font-semibold text-gray-800">{item.author?.name || 'Reporter'}</span>
                                            {item.tag && <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">{item.tag.replace('_', ' ')}</span>}
                                            {item.createdAt && <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>}
                                        </div>
                                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{item.message}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {report.detailCompleteness === 'full' && (
                        <section className="mt-5" aria-labelledby="incident-photos-heading">
                            <h3 id="incident-photos-heading" className="text-sm font-bold text-gray-900">Evidence photos ({report.images?.length || 0})</h3>
                            <div className="mt-3">
                                <ProtectedEvidenceGallery images={report.images || []} onViewImage={onViewImage} />
                            </div>
                        </section>
                    )}
                </div>

                <footer className="border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
                    <IncidentActionButtons
                        report={report}
                        user={user}
                        actions={actions}
                        onInspect={() => {}}
                        hideInspect
                    />
                </footer>
            </aside>
        </div>
    );
};

export default IncidentDetailsDrawer;
