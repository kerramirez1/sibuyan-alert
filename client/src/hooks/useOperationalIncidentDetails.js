import { useCallback, useEffect, useState } from 'react';
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
    const shouldLoad = Boolean(
        (isOperationalViewer || isOwnerViewer)
        && (report?.detailCompleteness !== 'full' || evidencePayloadIncomplete)
    );
    const [state, setState] = useState({
        report,
        loading: shouldLoad,
        error: '',
        restricted: false,
    });

    const load = useCallback(async (signal) => {
        if (!shouldLoad) {
            setState({ report, loading: false, error: '', restricted: false });
            return;
        }

        setState((current) => ({
            ...current,
            report: current.report?._id === reportId ? current.report : report,
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
            setState({
                report: { ...report, ...normalizedReport },
                loading: false,
                error: '',
                restricted: false,
            });
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
            const restricted = error?.response?.status === 403;
            setState({
                report,
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
    }, [isOperationalViewer, report, reportId, shouldLoad]);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const retry = useCallback(() => load(undefined), [load]);

    return { ...state, retry, isOperationalViewer, isOwnerViewer };
};

export default useOperationalIncidentDetails;
