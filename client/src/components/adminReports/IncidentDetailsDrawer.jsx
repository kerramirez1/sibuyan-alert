import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
    HiOutlineExclamationCircle,
    HiOutlineRefresh,
    HiOutlineX,
} from 'react-icons/hi';
import ProtectedEvidenceGallery from '../report/ProtectedEvidenceGallery';
import IncidentLocationPreview from './IncidentLocationPreview';
import { IncidentActionButtons, IncidentStatusBadge } from './IncidentQueue';
import ResponderIncidentInspector from './ResponderIncidentInspector';
import {
    getAgencyLabel,
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
    <div className="min-w-0 border-t border-gray-100 py-3 dark:border-gray-700">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{children || 'Unavailable'}</dd>
    </div>
);

const CasualtyBlock = ({ report }) => {
    const cas = report?.casualties || {};
    const injured = Number(cas.injured) || Number(report?.injured) || 0;
    const fatalities = Number(cas.fatalities) || Number(report?.fatalities) || Number(report?.deaths) || 0;
    const missing = Number(cas.missing) || Number(report?.missing) || 0;
    const total = injured + fatalities + missing;
    const stats = [
        { label: 'Injured', value: injured },
        { label: 'Fatalities', value: fatalities },
        { label: 'Missing', value: missing },
    ];
    return (
        <div className="col-span-full border-t border-gray-100 py-3 dark:border-gray-700">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Casualties and injuries</dt>
            <dd className="mt-2 flex items-stretch divide-x divide-gray-200 rounded-sm border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                {stats.map(({ label, value }) => (
                    <div key={label} className="flex flex-1 flex-col items-center px-3 py-2">
                        <span className={`text-lg font-bold tabular-nums leading-tight ${value > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'}`}>{value}</span>
                        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
                    </div>
                ))}
            </dd>
            {total === 0 && (
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">No casualties or injuries were reported for this incident.</p>
            )}
        </div>
    );
};

const AdministrativeIncidentDetailsDrawer = ({
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

    return createPortal(
        <aside
            id="administrative-incident-inspector"
            ref={panelRef}
            className={`fixed inset-y-0 right-0 z-40 flex min-h-0 w-full flex-col overflow-hidden border-l-2 border-gray-300 bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-gray-700 dark:bg-gray-800 md:w-[30rem] md:max-w-[calc(100vw-2rem)] ${entered ? 'translate-x-0' : 'translate-x-full'}`}
            role="dialog"
            aria-modal="false"
            aria-labelledby="incident-details-title"
        >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Incident record</p>
                    <h2 id="incident-details-title" className="mt-1 line-clamp-2 break-words text-lg font-bold leading-6 text-gray-950 dark:text-white">
                        {report.address || 'Incident details'}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <IncidentStatusBadge status={report.status} />
                        <span className={`rounded-sm border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${SEVERITY_STYLES[report.severity] || 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                            {report.severity || 'Unspecified'} severity
                        </span>
                    </div>
                </div>
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => onClose()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                    aria-label="Close incident details"
                >
                    <HiOutlineX className="h-5 w-5" aria-hidden="true" />
                </button>
            </header>

            <div
                ref={panelBodyRef}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
            >
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
                        <h3 id="incident-overview-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Incident overview</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                            <DetailItem label="Type"><span className="capitalize">{report.incidentType || report.accidentType || report.incidentCategory}</span></DetailItem>
                            <DetailItem label="Severity"><span className="capitalize">{report.severity || 'Moderate'}</span></DetailItem>
                            {report.fireInvolved && (
                                <DetailItem label="Fire">
                                    Yes {report.fireType ? `(${report.fireType.replace('_', ' ')})` : ''}
                                </DetailItem>
                            )}
                            <DetailItem label="Incident time">{formatDate(incidentDate)}</DetailItem>
                            <DetailItem label="Municipality">{report.municipalityName || report.municipality?.name}</DetailItem>
                            <DetailItem label="Submitted">{formatDate(report.createdAt)}</DetailItem>
                            <DetailItem label="Reporter">{report.reporter?.name || 'Unknown reporter'}</DetailItem>
                            <DetailItem label="Reporter account">{report.reporter?.isVerified ? 'Verified' : 'Not verified'}</DetailItem>
                            <CasualtyBlock report={report} />
                        </dl>
                    </section>

                    <section className="mt-5 border-t border-gray-100 py-4 dark:border-gray-700" aria-labelledby="incident-description-heading">
                        <h3 id="incident-description-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Description</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
                            {report.description || 'No description provided.'}
                        </p>
                    </section>

                    {transfers.length > 0 && (
                        <section className="mt-5 border-t border-gray-100 py-4 dark:border-gray-700" aria-labelledby="transfer-history-heading">
                            <h3 id="transfer-history-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Transfer history</h3>
                            <ol className="mt-3 space-y-3">
                                {transfers.map((transfer, index) => (
                                    <li key={transfer._id || `${transfer.transferredAt}-${index}`} className="rounded-sm border border-violet-200 bg-violet-50/60 p-4">
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
                                                <span className="w-fit rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-800">Acknowledged</span>
                                            ) : (
                                                <span className="w-fit rounded-sm border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800">Awaiting acknowledgment</span>
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

                    <IncidentLocationPreview
                        report={report}
                        userRole={user?.role}
                        onOpenMap={onOpenMap}
                    />

                    {(report.respondedBy || report.status === 'resolved') && (
                        <section className="mt-5 rounded-sm border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950" aria-labelledby="incident-response-heading">
                            <h3 id="incident-response-heading" className="text-[11px] font-bold uppercase tracking-wider text-blue-950 dark:text-blue-100">Response record</h3>
                            <p className="mt-2 text-sm text-blue-900">
                                {getAgencyLabel(report.respondedBy?.agency || report.responderAgency)} · {report.respondedBy?.name || 'Assigned responder'}
                            </p>
                            {report.respondedAt && <p className="mt-1 text-xs text-blue-700">Response started {formatDistanceToNow(new Date(report.respondedAt), { addSuffix: true })}</p>}
                            {report.resolvedAt && <p className="mt-1 text-xs text-blue-700">Resolved {formatDistanceToNow(new Date(report.resolvedAt), { addSuffix: true })}</p>}
                            {report.resolutionNotes && <p className="mt-3 border-t border-blue-200 pt-3 text-sm text-blue-900">{report.resolutionNotes}</p>}
                        </section>
                    )}

                    {updates.length > 0 && (
                        <section className="mt-5 border-t border-gray-100 py-4 dark:border-gray-700" aria-labelledby="incident-updates-heading">
                            <h3 id="incident-updates-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Reporter updates</h3>
                            <ol className="mt-3 space-y-2">
                                {updates.map((item, index) => (
                                    <li
                                        key={`${item.createdAt || 'update'}-${index}`}
                                        className={`rounded-sm border border-gray-200 p-3 dark:border-gray-600 ${effectiveHighlightedUpdateId && String(item._id) === effectiveHighlightedUpdateId ? 'bg-gray-100 dark:bg-gray-700 ring-2 ring-gray-500/20' : ''}`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span className="font-bold text-gray-800 dark:text-gray-200">{item.author?.name || 'Reporter'}</span>
                                            {item.tag && <span className="rounded-sm bg-gray-100 px-2 py-0.5 capitalize dark:bg-gray-800">{item.tag.replace('_', ' ')}</span>}
                                            {item.createdAt && <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>}
                                        </div>
                                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{item.message}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {report.detailCompleteness === 'full' && (
                        <section className="mt-5 border-t border-gray-100 py-4 dark:border-gray-700" aria-labelledby="incident-photos-heading">
                            <h3 id="incident-photos-heading" className="text-[11px] font-bold uppercase tracking-wider text-gray-950 dark:text-white">Evidence photos ({report.images?.length || 0})</h3>
                            <div className="mt-3">
                                <ProtectedEvidenceGallery images={report.images || []} onViewImage={onViewImage} />
                            </div>
                        </section>
                    )}
                </div>

                <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950 sm:px-5">
                    <IncidentActionButtons
                        report={report}
                        user={user}
                        actions={actions}
                        onInspect={() => {}}
                        hideInspect
                    />
                </footer>
            </aside>,
            document.body
        );
};

const IncidentDetailsDrawer = (props) => (
    props.user?.role === 'responder'
        ? <ResponderIncidentInspector {...props} />
        : <AdministrativeIncidentDetailsDrawer {...props} />
);

export default IncidentDetailsDrawer;
