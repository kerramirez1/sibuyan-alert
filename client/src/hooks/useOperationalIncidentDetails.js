import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI, reportsAPI } from '../services/api';

const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder']);

const getReportId = (report) => report?._id || report?.id || '';
const getEvidenceCount = (report) => {
    const declaredCount = Number(report?.evidenceCount);
    const imageCount = Array.isArray(report?.images) ? report.images.length : 0;
    return Math.max(Number.isFinite(declaredCount) && declaredCount > 0 ? Math.floor(declaredCount) : 0, imageCount);
};

const useOperationalIncidentDetails = (report, viewerRole) => {
    const reportId = getReportId(report);
    const isOperationalViewer = Boolean(reportId && OPERATIONAL_ROLES.has(viewerRole));
    const isOwnerViewer = Boolean(reportId && viewerRole === 'reporter' && report?.isOwnedByCurrentUser);
    const evidenceCount = getEvidenceCount(report);
    const loadedImageCount = Array.isArray(report?.images) ? report.images.length : 0;
    const evidencePayloadIncomplete = evidenceCount > loadedImageCount;
    const loadedReportIdRef = useRef(null);

    const shouldLoad = Boolean(
        (isOperationalViewer || isOwnerViewer)
        && (reportId !== loadedReportIdRef.current || evidencePayloadIncomplete)
        && report?.detailCompleteness !== 'full'
    );

    const [state, setState] = useState({
        extraDetails: null,
        loading: shouldLoad,
        error: '',
        restricted: false,
    });

    const load = useCallback(async (signal) => {
        if (!reportId) {
            loadedReportIdRef.current = null;
            setState({ extraDetails: null, loading: false, error: '', restricted: false });
            return;
        }

        if (!shouldLoad) {
            setState((current) => ({
                ...current,
                loading: false,
                error: '',
                restricted: false,
            }));
            return;
        }

        setState((current) => ({
            ...current,
            loading: true,
            error: '',
            restricted: false,
        }));

        try {
            const response = isOperationalViewer
                ? await adminAPI.getReportById(reportId, { signal })
                : await reportsAPI.getById(reportId, { signal });
            const loadedReport = response.data?.data;
            if (!loadedReport) throw new Error('Incident detail response is empty');
            const normalizedReport = {
                ...loadedReport,
                evidenceCount: getEvidenceCount(loadedReport),
                detailAccess: isOperationalViewer ? 'operational' : 'owner',
                detailCompleteness: 'full',
            };
            loadedReportIdRef.current = reportId;
            setState({
                extraDetails: normalizedReport,
                loading: false,
                error: '',
                restricted: false,
            });
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
            const restricted = error?.response?.status === 403;
            setState({
                extraDetails: null,
                loading: false,
                restricted,
                error: restricted
                    ? isOperationalViewer
                        ? 'Protected operational details are unavailable for this incident.'
                        : 'Evidence photos are available only to the report owner.'
                    : error?.response?.data?.message
                        || (isOperationalViewer
                            ? 'Unable to load operational incident details.'
                            : 'Unable to load your evidence photos.'),
            });
        }
    }, [isOperationalViewer, reportId, shouldLoad]);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const retry = useCallback(() => {
        loadedReportIdRef.current = null;
        return load(undefined);
    }, [load]);

    const resolvedReport = useMemo(() => {
        if (!report) return null;
        if (!state.extraDetails || getReportId(state.extraDetails) !== reportId) {
            return report;
        }
        return {
            ...report,
            ...state.extraDetails,
            ...(report.status ? { status: report.status } : {}),
            ...(report.rejectionReason !== undefined ? { rejectionReason: report.rejectionReason } : {}),
            ...(report.verifiedBy !== undefined ? { verifiedBy: report.verifiedBy } : {}),
            ...(report.verifiedAt !== undefined ? { verifiedAt: report.verifiedAt } : {}),
            ...(report.respondedBy !== undefined ? { respondedBy: report.respondedBy } : {}),
            ...(report.respondedAt !== undefined ? { respondedAt: report.respondedAt } : {}),
            ...(report.responders !== undefined ? { responders: report.responders } : {}),
            ...(report.resolvedBy !== undefined ? { resolvedBy: report.resolvedBy } : {}),
            ...(report.resolvedAt !== undefined ? { resolvedAt: report.resolvedAt } : {}),
            ...(report.resolutionNotes !== undefined ? { resolutionNotes: report.resolutionNotes } : {}),
            ...(report.transferredAt !== undefined ? { transferredAt: report.transferredAt } : {}),
            ...(report.transferHistory !== undefined ? { transferHistory: report.transferHistory } : {}),
            ...(report.reportUpdates !== undefined ? { reportUpdates: report.reportUpdates } : {}),
        };
    }, [report, reportId, state.extraDetails]);

    return {
        report: resolvedReport,
        loading: state.loading,
        error: state.error,
        restricted: state.restricted,
        retry,
        isOperationalViewer,
        isOwnerViewer,
    };
};

export default useOperationalIncidentDetails;
