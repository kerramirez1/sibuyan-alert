import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI } from '../services/api';
import { getRoleStatuses } from '../components/adminReports/incidentReportConfig';

const getErrorMessage = (error) => (
    error?.response?.data?.message || 'Unable to load incident reports. Please try again.'
);

const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 20, total: 0, pages: 0 });

const useIncidentReports = ({ subscribe, role, responderView = 'all', initialStatus = '', focusedReportId = '', reconnectVersion = 0 }) => {
    const validInitialStatus = getRoleStatuses(role).includes(initialStatus) ? initialStatus : '';
    const [reports, setReports] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [status, setStatusState] = useState(responderView === 'all' ? validInitialStatus : '');
    const [searchDraft, setSearchDraft] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(EMPTY_PAGINATION);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    useEffect(() => {
        if (!status || getRoleStatuses(role).includes(status)) return;
        setStatusState('');
        setPage(1);
    }, [role, status]);

    const fetchReports = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        setError('');

        try {
            const params = focusedReportId
                ? { reportId: focusedReportId }
                : {
                    page,
                    limit: 20,
                    ...(responderView !== 'all' ? { responderView } : {}),
                    ...(responderView === 'all' && status ? { status } : {}),
                    ...(appliedSearch ? { search: appliedSearch } : {}),
                };
            const response = await adminAPI.getReports(params);
            const data = response.data?.data || {};
            const nextReports = Array.isArray(data.reports) ? data.reports : [];
            setReports(nextReports);
            if (focusedReportId) {
                const focusedReport = nextReports.find((report) => report._id === focusedReportId);
                setSelectedReport(focusedReport || null);
            } else {
                setSelectedReport((current) => {
                    if (!current?._id) return current;
                    const matchingReport = nextReports.find((report) => report._id === current._id);
                    return matchingReport ? { ...current, ...matchingReport } : current;
                });
            }
            setStats(data.stats || null);
            setPagination(data.pagination || {
                ...EMPTY_PAGINATION,
                total: nextReports.length,
                pages: nextReports.length > 0 ? 1 : 0,
            });
            setLastUpdatedAt(Date.now());
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [appliedSearch, focusedReportId, page, responderView, status]);

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
        const unsubNewReport = subscribe('newReport', () => {
            // The queue is paginated, searchable, and status-filtered, so a
            // silent refetch is the only insertion path that stays consistent
            // with the active view instead of patching the thin broadcast payload.
            refreshRef.current({ silent: true });
        });

        const unsubRespond = subscribe('reportResponded', (data) => {
            patchReport(data?.id, (report) => ({
                ...report,
                status: 'responding',
                respondedBy: report.respondedBy || data?.respondedBy,
                respondedAt: report.respondedAt || data?.respondedAt,
                responders: data?.responders || report.responders,
                responderAgency: report.responderAgency || data?.respondedBy?.agency,
            }));
            refreshRef.current({ silent: true });
        });

        const unsubResolve = subscribe('reportResolved', (data) => {
            patchReport(data?.id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
            });
            refreshRef.current({ silent: true });
        });

        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            patchReport(data?.id, {
                status: 'resolved',
                resolvedBy: data?.resolvedBy,
                resolvedAt: data?.resolvedAt,
                resolutionNotes: data?.resolutionNotes,
            });
        });

        const unsubVerify = subscribe('reportVerified', (data) => {
            patchReport(data?.id, { ...data, status: 'verified' });
            refreshRef.current({ silent: true });
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
            patchReport(data.id, {
                reportUpdates: data.report.reportUpdates,
                latestReporterUpdate: data.update || null,
                hasUnreadReporterUpdate: true,
            });
        });

        return () => {
            unsubNewReport();
            unsubRespond();
            unsubResolve();
            unsubResolutionDetails();
            unsubVerify();
            unsubReject();
            unsubDelete();
            unsubTransferred();
            unsubTransferAcknowledged();
            unsubReporterUpdate();
        };
    }, [patchReport, removeReport, subscribe]);

    // Recover any lifecycle events missed while the socket was disconnected.
    useEffect(() => {
        if (reconnectVersion > 0) refreshRef.current({ silent: true });
    }, [reconnectVersion]);

    useEffect(() => {
        setPage(1);
        if (responderView !== 'all') setStatusState('');
    }, [responderView]);

    const visibleReports = useMemo(() => {
        if (responderView === 'all' && status) {
            return reports.filter((report) => report.status === status);
        }
        return reports;
    }, [reports, responderView, status]);

    const setStatus = useCallback((nextStatus) => {
        setPage(1);
        setStatusState(nextStatus);
    }, []);

    const applySearch = useCallback(() => {
        const nextSearch = searchDraft.trim();
        if (nextSearch === appliedSearch) {
            fetchReports();
            return;
        }
        setPage(1);
        setAppliedSearch(nextSearch);
    }, [appliedSearch, fetchReports, searchDraft]);

    const clearFilters = useCallback(() => {
        setSearchDraft('');
        setAppliedSearch('');
        setStatusState('');
        setPage(1);
    }, []);

    const inspectReport = useCallback((report) => {
        if (!report?._id) return;
        const inspectedReport = {
            ...report,
            hasUnreadReporterUpdate: false,
            highlightedReporterUpdateId: report.hasUnreadReporterUpdate
                ? report.latestReporterUpdate?._id
                : report.highlightedReporterUpdateId,
        };
        setReports((current) => current.map((item) => (
            item._id === report._id ? { ...item, hasUnreadReporterUpdate: false } : item
        )));
        setSelectedReport(inspectedReport);
    }, []);

    return {
        reports,
        visibleReports,
        stats,
        pagination,
        lastUpdatedAt,
        page,
        setPage,
        loading,
        error,
        status,
        setStatus,
        searchDraft,
        setSearchDraft,
        appliedSearch,
        applySearch,
        clearFilters,
        selectedReport,
        setSelectedReport,
        inspectReport,
        patchReport,
        removeReport,
        refreshReports: fetchReports,
    };
};

export default useIncidentReports;
