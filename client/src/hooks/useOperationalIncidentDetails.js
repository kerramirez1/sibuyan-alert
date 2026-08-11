import { useCallback, useEffect, useRef, useState } from 'react';
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

    // Use a ref to capture the latest `report` prop without destabilizing
    // the `load` callback. The `report` object reference changes on every
    // parent re-render (objects are never referentially stable), so including
    // it directly in `useCallback` deps would recreate `load` on every
    // render → fire the `useEffect` → trigger an API request every time.
    const reportRef = useRef(report);
    reportRef.current = report;

    const load = useCallback(async (signal) => {
        const currentReport = reportRef.current;

        if (!shouldLoad) {
            setState({ report: currentReport, loading: false, error: '', restricted: false });
            return;
        }

        setState((current) => ({
            ...current,
            report: current.report?._id === reportId ? current.report : currentReport,
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
                report: { ...currentReport, ...normalizedReport },
                loading: false,
                error: '',
                restricted: false,
            });
        } catch (error) {
            if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') return;
            const restricted = error?.response?.status === 403;
            setState({
                report: currentReport,
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

    const retry = useCallback(() => load(undefined), [load]);

    return { ...state, retry, isOperationalViewer, isOwnerViewer };
};

export default useOperationalIncidentDetails;
