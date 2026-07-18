import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI } from '../services/api';
import { hasResponderAssigned, INCIDENT_LIFECYCLE } from '../components/adminReports/incidentReportConfig';

const getErrorMessage = (error) => (
    error?.response?.data?.message || 'Unable to load incident reports. Please try again.'
);

const useIncidentReports = ({ subscribe, isDispatchQueueView, initialStatus = '' }) => {
    const validInitialStatus = INCIDENT_LIFECYCLE.includes(initialStatus) ? initialStatus : '';
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatus] = useState(isDispatchQueueView ? '' : validInitialStatus);
    const [searchDraft, setSearchDraft] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [selectedReport, setSelectedReport] = useState(null);

    const fetchReports = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        setError('');

        try {
            const params = {
                ...(!isDispatchQueueView && status ? { status } : {}),
                ...(appliedSearch ? { search: appliedSearch } : {}),
                ...(showAll ? { showAll: 'true' } : {}),
            };
            const response = await adminAPI.getReports(params);
            const data = response.data?.data || {};
            setReports(Array.isArray(data.reports) ? data.reports : []);
            setStats(data.stats || null);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [appliedSearch, isDispatchQueueView, showAll, status]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const refreshRef = useRef(fetchReports);
    useEffect(() => {
        refreshRef.current = fetchReports;
    }, [fetchReports]);

    const patchReport = useCallback((id, changes) => {
        if (!id) return;
        setReports((current) => current.map((report) => (
            report._id === id
                ? (typeof changes === 'function' ? changes(report) : { ...report, ...changes })
                : report
        )));
        setSelectedReport((current) => (
            current?._id === id
                ? (typeof changes === 'function' ? changes(current) : { ...current, ...changes })
                : current
        ));
    }, []);

    const removeReport = useCallback((id) => {
        if (!id) return;
        setReports((current) => current.filter((report) => report._id !== id));
        setSelectedReport((current) => (current?._id === id ? null : current));
    }, []);

    useEffect(() => {
        const unsubRespond = subscribe('reportResponded', (data) => {
            patchReport(data?.id, (report) => ({
                ...report,
                status: 'responding',
                respondedBy: report.respondedBy || data?.respondedBy,
                respondedAt: report.respondedAt || data?.respondedAt,
                responders: data?.responders || report.responders,
                responderAgency: report.responderAgency || data?.respondedBy?.agency,
            }));
        });

        const unsubResolve = subscribe('reportResolved', (data) => {
            patchReport(data?.id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
                resolutionNotes: data?.resolutionNotes,
            });
        });

        const unsubVerify = subscribe('reportVerified', (data) => {
            patchReport(data?.id, { ...data, status: 'verified' });
        });

        const unsubReject = subscribe('reportRejectedUpdate', (data) => {
            patchReport(data?.id, { status: 'rejected' });
        });

        const unsubDelete = subscribe('reportDeleted', (data) => {
            removeReport(data?.id);
            refreshRef.current({ silent: true });
        });

        const unsubTransferred = subscribe('reportTransferred', (data) => {
            patchReport(data?.id, {
                ...data,
                status: 'transferred',
                municipalityName: data?.municipalityName || data?.toMunicipality,
            });
            refreshRef.current({ silent: true });
        });

        const unsubTransferAcknowledged = subscribe('reportTransferAcknowledged', (data) => {
            patchReport(data?.id, (report) => {
                const history = Array.isArray(report.transferHistory) ? report.transferHistory : [];
                const targetTransferId = data?.transferId?.toString();
                return {
                    ...report,
                    transferHistory: history.map((transfer, index) => {
                        const transferId = (transfer._id || transfer.id)?.toString();
                        const isTarget = targetTransferId
                            ? transferId === targetTransferId
                            : index === history.length - 1;
                        return isTarget
                            ? {
                                ...transfer,
                                acknowledgedBy: data?.acknowledgedBy,
                                acknowledgedAt: data?.acknowledgedAt,
                            }
                            : transfer;
                    }),
                };
            });
        });

        const unsubReporterUpdate = subscribe('reportUpdatedByReporter', (data) => {
            if (!data?.id || !data?.report?.reportUpdates) return;
            patchReport(data.id, { reportUpdates: data.report.reportUpdates });
        });

        return () => {
            unsubRespond();
            unsubResolve();
            unsubVerify();
            unsubReject();
            unsubDelete();
            unsubTransferred();
            unsubTransferAcknowledged();
            unsubReporterUpdate();
        };
    }, [patchReport, removeReport, subscribe]);

    useEffect(() => {
        if (isDispatchQueueView && status) setStatus('');
    }, [isDispatchQueueView, status]);

    const visibleReports = useMemo(() => (
        isDispatchQueueView
            ? reports.filter((report) => (
                report.status === 'transferred'
                || (report.status === 'verified' && !hasResponderAssigned(report))
            ))
            : reports
    ), [isDispatchQueueView, reports]);

    const applySearch = useCallback(() => {
        const nextSearch = searchDraft.trim();
        if (nextSearch === appliedSearch) {
            fetchReports();
            return;
        }
        setAppliedSearch(nextSearch);
    }, [appliedSearch, fetchReports, searchDraft]);

    const clearFilters = useCallback(() => {
        setSearchDraft('');
        setAppliedSearch('');
        setStatus('');
    }, []);

    return {
        reports,
        visibleReports,
        stats,
        loading,
        error,
        status,
        setStatus,
        searchDraft,
        setSearchDraft,
        appliedSearch,
        applySearch,
        clearFilters,
        showAll,
        setShowAll,
        selectedReport,
        setSelectedReport,
        patchReport,
        removeReport,
        refreshReports: fetchReports,
    };
};

export default useIncidentReports;
