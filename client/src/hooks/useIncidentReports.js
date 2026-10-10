import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI } from '../services/api';
import { getRoleStatuses } from '../components/adminReports/incidentReportConfig';
import {
    QUERY_CACHE_TTLS,
    dedupedFetch,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';

export const getIncidentQueueCacheKey = ({ role, responderView, status, category, page, appliedSearch, focusedReportId }) => (
    `incident-queue:${role || 'unknown'}:${responderView || 'all'}:${status || ''}:${category || ''}:p${page}:q${appliedSearch || ''}:f${focusedReportId || ''}`
);

const getErrorMessage = (error) => (
    error?.response?.data?.message || 'Unable to load incident reports. Please try again.'
);

const EMPTY_PAGINATION = Object.freeze({ page: 1, limit: 20, total: 0, pages: 0 });

const useIncidentReports = ({ subscribe, role, responderView = 'all', initialStatus = '', focusedReportId = '', reconnectVersion = 0 }) => {
    const validInitialStatus = getRoleStatuses(role).includes(initialStatus) ? initialStatus : '';
    const [reports, setReports] = useState(() => {
        const initialKey = getIncidentQueueCacheKey({
            role, responderView, status: responderView === 'all' ? validInitialStatus : '', page: 1, appliedSearch: '', focusedReportId,
        });
        const cachedReports = getStaleData(initialKey)?.reports;
        return Array.isArray(cachedReports) ? cachedReports.filter(Boolean) : [];
    });
    const [stats, setStats] = useState(() => {
        const initialKey = getIncidentQueueCacheKey({
            role, responderView, status: responderView === 'all' ? validInitialStatus : '', page: 1, appliedSearch: '', focusedReportId,
        });
        const cachedStats = getStaleData(initialKey)?.stats;
        return cachedStats && typeof cachedStats === 'object' && !Array.isArray(cachedStats) ? cachedStats : null;
    });
    const [loading, setLoading] = useState(() => {
        const initialKey = getIncidentQueueCacheKey({
            role, responderView, status: responderView === 'all' ? validInitialStatus : '', page: 1, appliedSearch: '', focusedReportId,
        });
        return getStaleData(initialKey) === null;
    });
    const [error, setError] = useState('');
    const [status, setStatusState] = useState(responderView === 'all' ? validInitialStatus : '');
    const [category, setCategoryState] = useState('');
    const [searchDraft, setSearchDraft] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [selectedReport, setSelectedReport] = useState(null);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(EMPTY_PAGINATION);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

    // P2-9: monotonic id for in-flight queue fetches. A newer fetch (e.g. a
    // rapid pending→verified tab switch) invalidates older ones: a stale
    // response arriving late must not overwrite the list for the current tab.
    const fetchRequestIdRef = useRef(0);

    useEffect(() => {
        if (!status || getRoleStatuses(role).includes(status)) return;
        setStatusState('');
        setPage(1);
    }, [role, status]);

    const fetchReports = useCallback(async ({ silent = false, force = false } = {}) => {
        const requestId = ++fetchRequestIdRef.current;
        const isStaleResponse = () => requestId !== fetchRequestIdRef.current;
        const cacheKey = getIncidentQueueCacheKey({ role, responderView, status, category, page, appliedSearch, focusedReportId });
        // Explicit user actions (Refresh / Try again) bypass the fresh-cache
        // shortcut; automatic mount fetches use it to kill the 2nd-visit skeleton.
        if (!silent && !force) {
            const fresh = getCachedData(cacheKey, QUERY_CACHE_TTLS.queue);
            if (fresh) {
                const cachedReports = Array.isArray(fresh?.reports) ? fresh.reports.filter(Boolean) : [];
                setReports(cachedReports);
                setStats(fresh?.stats && typeof fresh.stats === 'object' && !Array.isArray(fresh.stats) ? fresh.stats : null);
                const freshPagination = fresh?.pagination && typeof fresh.pagination === 'object' && !Array.isArray(fresh.pagination)
                    ? {
                        page: Number.isFinite(Number(fresh.pagination.page)) ? Number(fresh.pagination.page) : 1,
                        pages: Number.isFinite(Number(fresh.pagination.pages)) ? Number(fresh.pagination.pages) : 1,
                        total: Number.isFinite(Number(fresh.pagination.total)) ? Number(fresh.pagination.total) : cachedReports.length,
                        limit: Number.isFinite(Number(fresh.pagination.limit)) ? Number(fresh.pagination.limit) : 20,
                    }
                    : { ...EMPTY_PAGINATION, total: cachedReports.length, pages: 1 };
                setPagination(freshPagination);
                setLastUpdatedAt(Date.now());
                setLoading(false);
                return;
            }
        }
        const stale = getStaleData(cacheKey);
        const hasStale = Boolean(stale);
        if (hasStale && !silent) {
            setReports(Array.isArray(stale?.reports) ? stale.reports.filter(Boolean) : []);
            setStats(stale?.stats && typeof stale.stats === 'object' && !Array.isArray(stale.stats) ? stale.stats : null);
            const stalePagination = stale?.pagination && typeof stale.pagination === 'object' && !Array.isArray(stale.pagination)
                ? {
                    page: Number.isFinite(Number(stale.pagination.page)) ? Number(stale.pagination.page) : 1,
                    pages: Number.isFinite(Number(stale.pagination.pages)) ? Number(stale.pagination.pages) : 1,
                    total: Number.isFinite(Number(stale.pagination.total)) ? Number(stale.pagination.total) : (Array.isArray(stale?.reports) ? stale.reports.length : 0),
                    limit: Number.isFinite(Number(stale.pagination.limit)) ? Number(stale.pagination.limit) : 20,
                }
                : EMPTY_PAGINATION;
            setPagination(stalePagination);
        }
        // Force (explicit Refresh) always shows the spinner, even with stale
        // data on screen, so the click has visible feedback.
        if (!silent && (!hasStale || force)) setLoading(true);
        setError('');

        try {
            const params = focusedReportId
                ? { reportId: focusedReportId }
                : {
                    page,
                    limit: 20,
                    ...(responderView !== 'all' ? { responderView } : {}),
                    ...(responderView === 'all' && status ? { status } : {}),
                    ...(category ? { category } : {}),
                    ...(appliedSearch ? { search: appliedSearch } : {}),
                };
            // Force bypasses request deduping too: an explicit Refresh must
            // always fire a real network request, never piggyback an
            // in-flight mount/socket fetch that would resolve with the same data.
            const response = force
                ? await adminAPI.getReports(params)
                : await dedupedFetch(cacheKey, () => adminAPI.getReports(params));
            // A newer fetch started while this one was in flight: drop the
            // stale response so the list always matches the selected tab.
            if (isStaleResponse()) return;
            const data = response.data?.data && typeof response.data.data === 'object' && !Array.isArray(response.data.data) ? response.data.data : {};
            const nextReports = Array.isArray(data.reports) ? data.reports.filter(Boolean) : [];
            const nextStats = data.stats && typeof data.stats === 'object' && !Array.isArray(data.stats) ? data.stats : null;
            const rawPagination = data.pagination && typeof data.pagination === 'object' && !Array.isArray(data.pagination) ? data.pagination : null;
            const nextPagination = rawPagination
                ? {
                    page: Number.isFinite(Number(rawPagination.page)) ? Number(rawPagination.page) : 1,
                    pages: Number.isFinite(Number(rawPagination.pages)) ? Number(rawPagination.pages) : 1,
                    total: Number.isFinite(Number(rawPagination.total)) ? Number(rawPagination.total) : nextReports.length,
                    limit: Number.isFinite(Number(rawPagination.limit)) ? Number(rawPagination.limit) : 20,
                }
                : {
                    ...EMPTY_PAGINATION,
                    page: 1,
                    pages: 1,
                    total: nextReports.length,
                };
            setReports(nextReports);
            if (focusedReportId) {
                const focusedReport = nextReports.find((report) => report?._id === focusedReportId);
                setSelectedReport(focusedReport || null);
            } else {
                setSelectedReport((current) => {
                    if (!current?._id) return current;
                    const matchingReport = nextReports.find((report) => report?._id === current._id);
                    return matchingReport ? { ...current, ...matchingReport } : current;
                });
            }
            setStats(nextStats);
            setPagination(nextPagination);
            setCachedData(cacheKey, { reports: nextReports, stats: nextStats, pagination: nextPagination });
            setLastUpdatedAt(Date.now());
        } catch (requestError) {
            // A stale request's error must not surface over the newer fetch.
            if (isStaleResponse()) return;
            // Keep stale queue on screen; only surface error when cache is empty.
            if (getStaleData(cacheKey) === null) setError(getErrorMessage(requestError));
        } finally {
            // Only the latest fetch may settle the loading state; an older
            // fetch finishing late must not clear a newer fetch's spinner.
            // (Wrapped instead of early-return: return inside finally is
            // banned by no-unsafe-finally.)
            if (!isStaleResponse()) {
                if (!silent) setLoading(false);
                else if (getStaleData(cacheKey) !== null) setLoading(false);
            }
        }
    }, [appliedSearch, category, focusedReportId, page, responderView, role, status]);

    useEffect(() => {
        const cacheKey = getIncidentQueueCacheKey({ role, responderView, status, category, page, appliedSearch, focusedReportId });
        if (getCachedData(cacheKey, QUERY_CACHE_TTLS.queue) !== null) {
            fetchReports();
            return;
        }
        if (getStaleData(cacheKey) !== null) {
            fetchReports({ silent: true });
            return;
        }
        fetchReports();
    }, [fetchReports, appliedSearch, category, focusedReportId, page, responderView, role, status]);

    const refreshRef = useRef(fetchReports);
    useEffect(() => {
        refreshRef.current = fetchReports;
    }, [fetchReports]);

    const patchReport = useCallback((id, changes) => {
        if (!id) return;
        const isFnChanges = typeof changes === 'function';
        const isObjectChanges = changes && typeof changes === 'object' && !Array.isArray(changes);
        if (!isFnChanges && !isObjectChanges) return;
        setReports((current) => (Array.isArray(current) ? current : []).map((report) => (
            report?._id === id
                ? (isFnChanges ? changes(report) : { ...report, ...changes })
                : report
        )));
        setSelectedReport((current) => (
            current?._id === id
                ? (isFnChanges ? changes(current) : { ...current, ...changes })
                : current
        ));
    }, []);

    const removeReport = useCallback((id) => {
        if (!id) return;
        setReports((current) => (Array.isArray(current) ? current : []).filter((report) => report?._id !== id));
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
                respondedBy: report?.respondedBy || data?.respondedBy,
                respondedAt: report?.respondedAt || data?.respondedAt,
                responders: Array.isArray(data?.responders) ? data.responders : report?.responders,
                responderAgency: report?.responderAgency || data?.respondedBy?.agency,
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
            patchReport(data?.id, { ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}), status: 'verified' });
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
                ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
                status: 'transferred',
                municipalityName: data?.municipalityName || data?.toMunicipality,
            });
            refreshRef.current({ silent: true });
        });

        // Targeted transfer alert for the responder room (municipality_{muni}_responders).
        // Same payload shape as 'reportTransferred' (socketService broadcastReportTransfer);
        // mirrors that handler so inter-municipality transfers update the queue live.
        const unsubTransferredAlert = subscribe('reportTransferredAlert', (data) => {
            patchReport(data?.id, {
                ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
                status: 'transferred',
                municipalityName: data?.municipalityName || data?.toMunicipality,
            });
            refreshRef.current({ silent: true });
        });

        const unsubTransferAcknowledged = subscribe('reportTransferAcknowledged', (data) => {
            patchReport(data?.id, (report) => {
                const history = Array.isArray(report?.transferHistory) ? report.transferHistory.filter(Boolean) : [];
                const targetTransferId = data?.transferId != null ? String(data.transferId) : '';
                return {
                    ...report,
                    transferHistory: history.map((transfer, index) => {
                        const transferId = (transfer?._id || transfer?.id)?.toString?.();
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
            if (!data?.id || !Array.isArray(data?.report?.reportUpdates)) return;
            patchReport(data.id, {
                reportUpdates: data.report.reportUpdates.filter(Boolean),
                latestReporterUpdate: data?.update && typeof data.update === 'object' && !Array.isArray(data.update) ? data.update : null,
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
            unsubTransferredAlert();
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
        const safeReports = Array.isArray(reports) ? reports.filter(Boolean) : [];
        return safeReports.filter((report) => {
            if (responderView === 'all' && status && report?.status !== status) return false;
            if (category && report?.incidentCategory !== category) return false;
            return true;
        });
    }, [reports, responderView, status, category]);

    const setStatus = useCallback((nextStatus) => {
        setPage(1);
        setStatusState(nextStatus);
    }, []);

    const setCategory = useCallback((nextCategory) => {
        setPage(1);
        setCategoryState(nextCategory);
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
        setCategoryState('');
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
        setReports((current) => (Array.isArray(current) ? current : []).map((item) => (
            item?._id === report?._id ? { ...item, hasUnreadReporterUpdate: false } : item
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
        category,
        setCategory,
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
