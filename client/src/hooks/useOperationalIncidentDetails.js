import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI, reportsAPI } from '../services/api';

const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder', 'admin', 'system_admin']);

const getReportId = (report) => {
    if (!report) return '';
    if (typeof report === 'string') return report;
    return report._id || report.id || '';
};

const getEvidenceCount = (report) => {
    if (!report || typeof report !== 'object') return 0;
    const declaredCount = Number(report?.evidence?.count ?? report?.evidence?.evidenceCount ?? report?.evidenceCount);
    const itemArrayCount = Array.isArray(report?.evidence?.items)
        ? report.evidence.items.length
        : Array.isArray(report?.evidence)
            ? report.evidence.length
            : 0;
    const imageCount = Array.isArray(report?.images) ? report.images.length : 0;
    return Math.max(
        Number.isFinite(declaredCount) && declaredCount > 0 ? Math.floor(declaredCount) : 0,
        itemArrayCount,
        imageCount
    );
};

const getRequestError = (error, isOperationalViewer, isOwnerViewer) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    if (status === 400 || code === 'INVALID_REPORT_ID') {
        return { message: 'This incident reference is invalid.', restricted: false, retryable: false };
    }
    if (status === 404 || code === 'REPORT_NOT_FOUND') {
        return { message: 'This incident is no longer available.', restricted: false, retryable: false };
    }
    if (status === 403 || code === 'REPORT_RESTRICTED') {
        return {
            message: isOperationalViewer
                ? 'You do not have permission to view this incident.'
                : isOwnerViewer
                    ? 'Evidence photos are available only to the report owner.'
                    : 'You do not have permission to view this incident.',
            restricted: true,
            retryable: false,
        };
    }
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') {
        return { message: '', restricted: false, retryable: false, canceled: true };
    }
    if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNABORTED' || !error?.response) {
        return { message: 'Connection problem. Check your network and try again.', restricted: false, retryable: true };
    }
    if (code === 'REPORT_DETAILS_UNAVAILABLE' || status >= 500) {
        return { message: 'Incident details are temporarily unavailable.', restricted: false, retryable: true };
    }
    if (error?.message === 'Incident detail response is empty') {
        return { message: 'The incident details response was incomplete.', restricted: false, retryable: true };
    }
    return {
        message: error?.response?.data?.message || 'Incident details are temporarily unavailable.',
        restricted: false,
        retryable: true,
    };
};

const useOperationalIncidentDetails = (report, viewerRole = 'guest') => {
    const reportId = getReportId(report);
    const isOperationalViewer = Boolean(reportId && OPERATIONAL_ROLES.has(viewerRole));
    const isOwnerViewer = Boolean(reportId && viewerRole === 'reporter' && report?.isOwnedByCurrentUser);

    const evidenceCount = getEvidenceCount(report);
    const loadedImageCount = Array.isArray(report?.images) ? report.images.length : 0;
    const loadedItemCount = Array.isArray(report?.evidence?.items)
        ? report.evidence.items.length
        : Array.isArray(report?.evidence)
            ? report.evidence.length
            : 0;
    const hasEvidenceDescriptors = loadedImageCount > 0 || loadedItemCount > 0;
    const evidencePayloadIncomplete = evidenceCount > 0 && !hasEvidenceDescriptors;

    const shouldLoad = Boolean(
        reportId && (
            report?.detailCompleteness !== 'full'
            || evidencePayloadIncomplete
            || (isOperationalViewer && !report?.detailAccess)
        )
    );

    const [state, setState] = useState({
        extraDetails: null,
        loading: shouldLoad,
        error: '',
        restricted: false,
        retryable: false,
    });

    const activeReportIdRef = useRef(reportId);
    const requestSequenceRef = useRef(0);
    activeReportIdRef.current = reportId;

    const load = useCallback(async (signal) => {
        const requestSequence = requestSequenceRef.current + 1;
        requestSequenceRef.current = requestSequence;
        const isCurrentRequest = () => (
            activeReportIdRef.current === reportId
            && requestSequenceRef.current === requestSequence
        );
        if (!reportId) {
            setState({ extraDetails: null, loading: false, error: '', restricted: false, retryable: false });
            return;
        }

        if (!shouldLoad) {
            setState((current) => ({
                ...current,
                loading: false,
                error: '',
                restricted: false,
                retryable: false,
            }));
            return;
        }

        setState({
            extraDetails: null,
            loading: true,
            error: '',
            restricted: false,
            retryable: false,
        });

        try {
            let response;
            if (isOperationalViewer) {
                try {
                    response = await adminAPI.getReportById(reportId, signal ? { signal } : {});
                } catch (adminErr) {
                    if (adminErr?.code === 'ERR_CANCELED' || adminErr?.name === 'CanceledError' || adminErr?.name === 'AbortError') return;
                    if (adminErr?.response?.status === 403) {
                        response = await reportsAPI.getById(reportId, signal ? { signal } : {});
                    } else {
                        throw adminErr;
                    }
                }
            } else {
                response = await reportsAPI.getById(reportId, signal ? { signal } : {});
            }

            if (!isCurrentRequest()) return;

            const loadedReport = response.data?.data;
            if (!loadedReport) throw new Error('Incident detail response is empty');
            const normalizedReport = {
                ...loadedReport,
                evidenceCount: getEvidenceCount(loadedReport),
                detailAccess: loadedReport.detailAccess || (isOperationalViewer ? 'operational' : isOwnerViewer ? 'owner' : 'public'),
                detailCompleteness: loadedReport.detailCompleteness || 'full',
            };

            setState({
                extraDetails: normalizedReport,
                loading: false,
                error: '',
                restricted: false,
                retryable: false,
            });
        } catch (error) {
            if (!isCurrentRequest()) return;
            const normalizedError = getRequestError(error, isOperationalViewer, isOwnerViewer);
            if (normalizedError.canceled) return;

            if (import.meta.env?.DEV) {
                console.debug('[MapIncidentDetails] report request failed', {
                    reportId,
                    endpoint: isOperationalViewer ? '/api/admin/reports/:id -> /api/reports/:id' : '/api/reports/:id',
                    status: error?.response?.status || null,
                    code: error?.response?.data?.code || null,
                    viewerRole,
                });
            }
            setState({
                extraDetails: null,
                loading: false,
                restricted: normalizedError.restricted,
                error: normalizedError.message,
                retryable: normalizedError.retryable,
            });
        }
    }, [isOperationalViewer, isOwnerViewer, reportId, shouldLoad, viewerRole]);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const retry = useCallback(() => {
        return load(undefined);
    }, [load]);

    const resolvedReport = useMemo(() => {
        if (!report && !state.extraDetails) return null;
        const base = (typeof report === 'object' && report !== null) ? report : { _id: reportId };
        if (!state.extraDetails || getReportId(state.extraDetails) !== reportId) {
            const copy = { ...base };
            if (!isOperationalViewer && !isOwnerViewer) {
                delete copy.images;
                if (copy.evidence && typeof copy.evidence === 'object' && copy.evidence.viewerAccess === 'original') {
                    copy.evidence = {
                        ...copy.evidence,
                        viewerAccess: 'redacted',
                    };
                }
            }
            return copy;
        }
        const merged = {
            ...base,
            ...state.extraDetails,
            ...(base.status ? { status: base.status } : {}),
            ...(base.rejectionReason !== undefined ? { rejectionReason: base.rejectionReason } : {}),
            ...(base.verifiedBy !== undefined ? { verifiedBy: base.verifiedBy } : {}),
            ...(base.verifiedAt !== undefined ? { verifiedAt: base.verifiedAt } : {}),
            ...(base.respondedBy !== undefined ? { respondedBy: base.respondedBy } : {}),
            ...(base.respondedAt !== undefined ? { respondedAt: base.respondedAt } : {}),
            ...(base.responders !== undefined ? { responders: base.responders } : {}),
            ...(base.resolvedBy !== undefined ? { resolvedBy: base.resolvedBy } : {}),
            ...(base.resolvedAt !== undefined ? { resolvedAt: base.resolvedAt } : {}),
            ...(base.resolutionNotes !== undefined ? { resolutionNotes: base.resolutionNotes } : {}),
            ...(base.municipality !== undefined ? { municipality: base.municipality } : {}),
            ...(base.municipalityName !== undefined ? { municipalityName: base.municipalityName } : {}),
            ...(base.transferredAt !== undefined ? { transferredAt: base.transferredAt } : {}),
            ...(base.transferHistory !== undefined ? { transferHistory: base.transferHistory } : {}),
            ...(base.reportUpdates !== undefined ? { reportUpdates: base.reportUpdates } : {}),
        };

        if (!isOperationalViewer && !isOwnerViewer) {
            delete merged.images;
            if (merged.evidence && typeof merged.evidence === 'object' && merged.evidence.viewerAccess === 'original') {
                merged.evidence = {
                    ...merged.evidence,
                    viewerAccess: 'redacted',
                };
            }
        }

        return merged;
    }, [report, reportId, state.extraDetails, isOperationalViewer, isOwnerViewer]);


    return {
        report: resolvedReport,
        loading: state.loading,
        error: state.error,
        restricted: state.restricted,
        retryable: state.retryable,
        retry,
        isOperationalViewer,
        isOwnerViewer,
    };
};

export default useOperationalIncidentDetails;
