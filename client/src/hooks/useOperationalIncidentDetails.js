import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../services/api';

const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder']);

const getReportId = (report) => report?._id || report?.id || '';

const useOperationalIncidentDetails = (report, viewerRole) => {
    const reportId = getReportId(report);
    const isOperationalViewer = Boolean(reportId && OPERATIONAL_ROLES.has(viewerRole));
    const shouldLoad = Boolean(isOperationalViewer && report?.detailCompleteness !== 'full');
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
            const response = await adminAPI.getReportById(reportId, { signal });
            const operationalReport = response.data?.data;
            if (!operationalReport) throw new Error('Operational report response is empty');
            setState({
                report: { ...report, ...operationalReport },
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
                    ? 'Protected operational details are unavailable for this incident.'
                    : error?.response?.data?.message || 'Unable to load operational incident details.',
            });
        }
    }, [report, reportId, shouldLoad]);

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    const retry = useCallback(() => load(undefined), [load]);

    return { ...state, retry, isOperationalViewer };
};

export default useOperationalIncidentDetails;
