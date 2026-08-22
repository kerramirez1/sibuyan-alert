import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI, reportsAPI } from '../services/api';

const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder', 'admin', 'system_admin']);

const getReportId = (report) => report?._id || report?.id || '';

const getEvidenceCount = (report) => {
    const declaredCount = Number(report?.evidence?.count ?? report?.evidenceCount);
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
    });

    const activeReportIdRef = useRef(reportId);
    activeReportIdRef.current = reportId;

    const load = useCallback(async (signal) => {
        if (!reportId) {
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

        setState({
            extraDetails: null,
            loading: true,
            error: '',
            restricted: false,
        });

        try {
            let response;
            if (isOperationalViewer) {
                try {
                    response = await adminAPI.getReportById(reportId, { signal });
                } catch (adminErr) {
                    if (adminErr?.code === 'ERR_CANCELED' || adminErr?.name === 'CanceledError' || adminErr?.name === 'AbortError') return;
                    if (adminErr?.response?.status === 403) {
                        response = await reportsAPI.getById(reportId, { signal });
                    } else {
                        throw adminErr;
                    }
                }
            } else {
                response = await reportsAPI.getById(reportId, { signal });
            }

            if (activeReportIdRef.current !== reportId) return;

            const loadedReport = response.data?.data;
            if (!loadedReport) throw new Error('Incident detail response is empty');
            const normalizedReport = {
                ...loadedReport,
                evidenceCount: getEvidenceCount(loadedReport),
                detailAccess: isOperationalViewer ? 'operational' : isOwnerViewer ? 'owner' : 'public',
                detailCompleteness: 'full',
            };

            setState({
                extraDetails: normalizedReport,
                loading: false,
                error: '',
                restricted: false,
            });
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
            if (activeReportIdRef.current !== reportId) return;

            const restricted = error?.response?.status === 403;
            setState({
                extraDetails: null,
                loading: false,
                restricted,
                error: restricted
                    ? isOperationalViewer
                        ? 'Protected operational details are unavailable for this incident.'
                        : isOwnerViewer
                            ? 'Evidence photos are available only to the report owner.'
                            : 'This incident is restricted for privacy.'
                    : error?.response?.data?.message
                        || (isOperationalViewer
                            ? 'Unable to load operational incident details.'
                            : isOwnerViewer
                                ? 'Unable to load your evidence photos.'
                                : 'Unable to load incident details.'),
            });
        }
    }, [isOperationalViewer, isOwnerViewer, reportId, shouldLoad]);

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
        const base = report || { _id: reportId };
        if (!state.extraDetails || getReportId(state.extraDetails) !== reportId) {
            return base;
        }
        return {
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
