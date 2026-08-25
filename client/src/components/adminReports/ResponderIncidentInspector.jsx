import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    HiOutlineBadgeCheck,
    HiOutlineCheckCircle,
    HiOutlineLightningBolt,
    HiOutlineSwitchHorizontal,
    HiOutlineTrash,
    HiOutlineX,
    HiOutlineXCircle,
} from 'react-icons/hi';
import IncidentDetailsContent from '../incidentDetails/IncidentDetailsContent';
import { IncidentSeverityIndicator, OperationalStatusIndicator } from './IncidentQueue';
import { getIncidentCapabilities } from './incidentReportConfig';

const AdminInspectorActions = ({ report, user, actions }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isReviewActive = Boolean(
        actions?.reviewDialog?.open
        && actions?.reviewDialog?.report?._id === report._id
    );
    const isTransferActive = Boolean(
        actions?.transferDialog?.open
        && actions?.transferDialog?.report?._id === report._id
    );
    const isVerify = actions?.reviewDialog?.status === 'verified';
    const isReject = actions?.reviewDialog?.status === 'rejected';
    const rejectionReason = actions?.reviewDialog?.rejectionReason || '';
    const rejectionInvalid = isReject && !rejectionReason.trim();

    const transferDialog = actions?.transferDialog || {};
    const transferReason = transferDialog?.reason || '';
    const transferReasonLength = transferReason.trim().length;
    const currentMunicipalityId = report?.municipality?._id || report?.municipality;
    const transferInvalid = !transferDialog.targetMunicipalityId || transferReasonLength < 10;

    const hasAnyAction = (
        capabilities.canVerify
        || capabilities.canReject
        || capabilities.canTransfer
        || capabilities.canAcknowledgeTransfer
        || capabilities.canDelete
    );

    if (!hasAnyAction) return null;

    if (isTransferActive) {
        return (
            <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-950 sm:px-5">
                <div
                    role="dialog"
                    aria-label="Transfer incident report"
                    aria-modal="false"
                    className="rounded-xl border border-violet-200/90 bg-violet-50/80 p-3.5 dark:border-violet-900/50 dark:bg-violet-950/40"
                >
                    <div className="flex items-start gap-2.5">
                        <HiOutlineSwitchHorizontal className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-violet-900 dark:text-violet-200">
                                Transfer incident
                            </h4>
                            <p className="mt-0.5 text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
                                Incident context: <span className="font-semibold text-gray-900 dark:text-white">{report.address || 'Selected incident'}</span>
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 space-y-3">
                        <div>
                            <label htmlFor="inspector-target-municipality" className="block text-[11px] font-bold uppercase tracking-wider text-violet-950 dark:text-violet-200">
                                Target municipality <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="inspector-target-municipality"
                                value={transferDialog.targetMunicipalityId || ''}
                                onChange={(e) => actions.setTransferDialog((prev) => ({ ...prev, targetMunicipalityId: e.target.value }))}
                                className="mt-1 min-h-9 w-full rounded-lg border border-violet-200/90 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-violet-900/50 dark:bg-[#07130e] dark:text-white"
                            >
                                <option value="">Select municipality</option>
                                {(actions.municipalities || [])
                                    .filter((item) => item._id?.toString() !== currentMunicipalityId?.toString() && item.name !== report.municipalityName)
                                    .map((item) => (
                                        <option key={item._id} value={item._id}>
                                            {item.name}
                                        </option>
                                    ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="inspector-transfer-reason" className="block text-[11px] font-bold uppercase tracking-wider text-violet-950 dark:text-violet-200">
                                Transfer reason <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                id="inspector-transfer-reason"
                                value={transferReason}
                                onChange={(e) => actions.setTransferDialog((prev) => ({ ...prev, reason: e.target.value }))}
                                placeholder="Explain the jurisdiction or mutual-aid reason"
                                required
                                minLength={10}
                                rows={2}
                                className="mt-1 w-full rounded-lg border border-violet-200/90 bg-white p-2 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-violet-900/50 dark:bg-[#07130e] dark:text-white"
                            />
                            <span className={`mt-1 block text-[11px] ${transferReasonLength > 0 && transferReasonLength < 10 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                Minimum 10 characters · {transferReasonLength}/10
                            </span>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={actions.closeTransfer}
                            disabled={actions.transferLoading}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={actions.confirmTransfer}
                            disabled={transferInvalid || actions.transferLoading}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3.5 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
                        >
                            {actions.transferLoading ? (
                                <>
                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                                    <span>Transferring...</span>
                                </>
                            ) : (
                                <span>Confirm transfer</span>
                            )}
                        </button>
                    </div>
                </div>
            </footer>
        );
    }

    if (isReviewActive) {
        return (
            <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-950 sm:px-5">
                {isVerify && (
                    <div
                        role="dialog"
                        aria-label="Verify incident report"
                        aria-modal="false"
                        className="rounded-xl border border-emerald-200/90 bg-emerald-50/80 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/40"
                    >
                        <div className="flex items-start gap-2.5">
                            <HiOutlineCheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                                    Verify incident report?
                                </h4>
                                <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                                    This will make the incident eligible for responder action and map visibility.
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={actions.closeReview}
                                disabled={actions.reviewLoading}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={actions.confirmReview}
                                disabled={actions.reviewLoading}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                            >
                                {actions.reviewLoading ? (
                                    <>
                                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                                        <span>Verifying...</span>
                                    </>
                                ) : (
                                    <span>Confirm verification</span>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {isReject && (
                    <div
                        role="dialog"
                        aria-label="Reject incident report"
                        aria-modal="false"
                        className="rounded-xl border border-red-200/90 bg-red-50/80 p-3.5 dark:border-red-900/50 dark:bg-red-950/40"
                    >
                        <div className="flex items-start gap-2.5">
                            <HiOutlineXCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-red-900 dark:text-red-200">
                                    Reject incident report?
                                </h4>
                                <p className="mt-0.5 text-xs text-red-800 dark:text-red-300 leading-relaxed">
                                    Provide a reason for rejecting this report. This will be visible to the reporter.
                                </p>
                            </div>
                        </div>

                        <div className="mt-2.5">
                            <label htmlFor="inspector-rejection-reason" className="sr-only">
                                Rejection reason
                            </label>
                            <textarea
                                id="inspector-rejection-reason"
                                value={rejectionReason}
                                onChange={(e) => actions.setReviewDialog((prev) => ({ ...prev, rejectionReason: e.target.value }))}
                                placeholder="Reason for rejection (required)..."
                                required
                                rows={2}
                                className="w-full rounded-lg border border-red-200/90 bg-white p-2 text-xs font-medium text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-red-900/50 dark:bg-[#07130e] dark:text-white"
                            />
                        </div>

                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={actions.closeReview}
                                disabled={actions.reviewLoading}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-200/90 bg-white px-3 text-xs font-semibold text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={actions.confirmReview}
                                disabled={rejectionInvalid || actions.reviewLoading}
                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3.5 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
                            >
                                {actions.reviewLoading ? (
                                    <>
                                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                                        <span>Rejecting...</span>
                                    </>
                                ) : (
                                    <span>Confirm rejection</span>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </footer>
        );
    }

    return (
        <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-950 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    {capabilities.canVerify && (
                        <button
                            type="button"
                            onClick={() => actions.openReview(report, 'verified')}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-4 text-xs font-semibold uppercase tracking-wider text-emerald-700 shadow-2xs transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 sm:flex-initial"
                            title="Verify report"
                            aria-label="Verify report"
                        >
                            <HiOutlineCheckCircle className="h-4 w-4" aria-hidden="true" />
                            <span>Verify report</span>
                        </button>
                    )}
                    {capabilities.canReject && (
                        <button
                            type="button"
                            onClick={() => actions.openReview(report, 'rejected')}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200/90 bg-red-50/80 px-4 text-xs font-semibold uppercase tracking-wider text-red-700 shadow-2xs transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 sm:flex-initial"
                            title="Reject report"
                            aria-label="Reject report"
                        >
                            <HiOutlineXCircle className="h-4 w-4" aria-hidden="true" />
                            <span>Reject report</span>
                        </button>
                    )}
                    {capabilities.canAcknowledgeTransfer && (
                        <button
                            type="button"
                            onClick={() => actions.acknowledgeTransfer(report)}
                            disabled={actions.acknowledgeLoadingId === report._id}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200/90 bg-violet-50/80 px-4 text-xs font-semibold uppercase tracking-wider text-violet-700 shadow-2xs transition-colors hover:bg-violet-100 disabled:cursor-wait disabled:opacity-50 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400 sm:flex-initial"
                            title="Acknowledge transfer"
                            aria-label="Acknowledge transfer"
                        >
                            <HiOutlineCheckCircle className={`h-4 w-4 ${actions.acknowledgeLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                            <span>Acknowledge transfer</span>
                        </button>
                    )}
                    {capabilities.canTransfer && (
                        <button
                            type="button"
                            onClick={() => actions.openTransfer(report)}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200/90 bg-violet-50/80 px-4 text-xs font-semibold uppercase tracking-wider text-violet-700 shadow-2xs transition-colors hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-400 sm:flex-initial"
                            title="Transfer report"
                            aria-label="Transfer report"
                        >
                            <HiOutlineSwitchHorizontal className="h-4 w-4" aria-hidden="true" />
                            <span>Transfer report</span>
                        </button>
                    )}
                </div>
                {capabilities.canDelete && (
                    <button
                        type="button"
                        onClick={() => actions.deleteReport(report)}
                        disabled={actions.deleteLoadingId === report._id}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200/90 bg-white text-gray-400 shadow-2xs transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        title="Delete report"
                        aria-label="Delete report"
                    >
                        <HiOutlineTrash className={`h-4 w-4 ${actions.deleteLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    </button>
                )}
            </div>
        </footer>
    );
};

const ResponderInspectorActions = ({ report, user, actions }) => {
    const capabilities = getIncidentCapabilities(user, report);
    const isResponding = report.status === 'responding';

    if (!capabilities.canRespond && !capabilities.canResolve) return null;

    return (
        <footer className="shrink-0 border-t border-gray-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-950 sm:px-5">
            {capabilities.canRespond && (
                <button
                    type="button"
                    onClick={() => actions.openRespond(report)}
                    disabled={actions.respondLoadingId === report._id}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-2xs transition-colors hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
                >
                    <HiOutlineLightningBolt className={`h-4 w-4 ${actions.respondLoadingId === report._id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    {isResponding ? 'Join response' : 'Respond to incident'}
                </button>
            )}

            {capabilities.canResolve && (
                <button
                    type="button"
                    onClick={() => actions.openResolve(report)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-xs font-semibold uppercase tracking-wider text-gray-700 shadow-2xs transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-900"
                >
                    <HiOutlineBadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
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
    const actionsRef = useRef(actions);
    const [entered, setEntered] = useState(false);
    const isOpen = Boolean(report);
    const reportId = String(report?._id || report?.id || '');

    useEffect(() => {
        actionsRef.current = actions;
    });

    useEffect(() => {
        if (!isOpen) return undefined;

        previouslyFocusedRef.current = document.activeElement;
        const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                if (event.defaultPrevented) return;
                // If evidence lightbox or higher-priority modal is active, let it handle Escape
                if (document.querySelector('[role="dialog"][aria-label="Enlarged evidence image viewer"]')) {
                    return;
                }
                if (actionsRef.current?.reviewDialog?.open) {
                    actionsRef.current.closeReview();
                    return;
                }
                onClose();
            }
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

    const municipality = report.municipalityName || report.municipality?.name || '';
    const locationTitle = report.address || [report.barangay, municipality].filter(Boolean).join(', ') || 'Incident details';
    const effectiveHighlightedUpdateId = highlightedUpdateId || report.highlightedReporterUpdateId || '';

    // MainLayout renders pages inside a transformed motion wrapper and a separate
    // scroll container. Portaling keeps this fixed panel viewport-bound instead of
    // allowing those ancestors to become its containing/clipping block.
    return createPortal(
        <aside
            id="responder-incident-inspector"
            ref={panelRef}
            className={`fixed inset-y-0 right-0 z-40 flex min-h-0 w-full flex-col overflow-hidden border-l border-gray-200/90 bg-white shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-white/10 dark:bg-[#0c1813]/95 md:w-[30rem] md:max-w-[calc(100vw-2rem)] ${entered ? 'translate-x-0' : 'translate-x-full'}`}
            role="dialog"
            aria-modal="false"
            aria-labelledby="responder-incident-details-title"
            data-testid="responder-incident-inspector"
        >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200/80 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-gray-950 sm:px-5">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Incident details</p>
                    <h2 id="responder-incident-details-title" className="mt-1 line-clamp-2 break-words font-display text-lg font-bold leading-6 text-gray-950 dark:text-white">
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
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
                <IncidentDetailsContent
                    report={report}
                    user={user}
                    viewerRole={user?.role}
                    loading={detailLoading}
                    error={detailError}
                    restricted={detailRestricted}
                    onRetry={onRetryDetails}
                    onOpenMap={onOpenMap}
                    onViewImage={onViewImage}
                    highlightedUpdateId={effectiveHighlightedUpdateId}
                    openedFromNotification={openedFromNotification}
                />
            </div>

            {user?.role === 'responder' ? (
                <ResponderInspectorActions report={report} user={user} actions={actions} />
            ) : (
                <AdminInspectorActions report={report} user={user} actions={actions} />
            )}
        </aside>,
        document.body,
    );
};

export default ResponderIncidentInspector;
