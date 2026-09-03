import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from '../router';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, adminAPI, analyticsAPI } from '../services/api';
import useGlobalHighRiskZones from '../hooks/useGlobalHighRiskZones';
// Workspace components lazy-split: defers recharts (analytics) and maplibre-gl UI (map)
// from the initial DashboardPage chunk — each workspace loads on first render only.
const DashboardMapWorkspace = lazy(() => import('../components/dashboard/DashboardMapWorkspace'));
const DashboardAnalyticsWorkspace = lazy(() => import('../components/dashboard/DashboardAnalyticsWorkspace'));
import {
    deduplicateDashboardReports,
    fetchAllReportPages,
    removeDashboardReport,
    updateDashboardReportStatus,
    upsertDashboardReport,
} from '../utils/dashboardReports';
import { getMapCoordinates } from '../utils/mapReports';
import { findRiskZoneById, normalizeRiskZoneId } from '../utils/riskZoneNavigation';
import { MAP_STATUS_CONFIG } from '../config/mapVisuals';
import { buildDailyIncidentTrend } from '../utils/analyticsTrend';
import {
    getManilaCalendarDateKey,
    getMillisecondsUntilNextManilaDay,
    getResolvedTodayReports,
} from '../utils/reportResolution';
import {
    QUERY_CACHE_TTLS,
    dedupedFetch,
    getCachedData,
    getStaleData,
    setCachedData,
} from '../utils/queryCache';
import { parseISO, differenceInMinutes, isSameMonth } from 'date-fns';

const getDashboardCacheKey = ({ canViewReports, isAdmin, isResponder, isReporter, activeMunicipality, isAuthenticated }) => {
    if (canViewReports && (isAdmin || isResponder) && activeMunicipality) {
        return `dashboard:operational:${activeMunicipality}`;
    }
    if (isAuthenticated && (isReporter || isResponder)) return 'dashboard:public:member';
    return 'dashboard:public:guest';
};

const getReporterOverviewCacheKey = (ownerId) => (ownerId ? `reporter-overview:${ownerId}` : null);

const DashboardPage = () => {
    const { user, isAuthenticated } = useAuth();
    const [reports, setReports] = useState([]);
    const {
        zones: highRiskZones,
        loading: highRiskZonesLoading,
        error: highRiskZonesError,
        refresh: refreshHighRiskZones,
    } = useGlobalHighRiskZones();
    const [roleStats, setRoleStats] = useState(null);
    const [reporterOverviewReports, setReporterOverviewReports] = useState(null);
    const [reporterOverviewReportsLoading, setReporterOverviewReportsLoading] = useState(false);
    const [reporterOverviewReportsError, setReporterOverviewReportsError] = useState('');
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const { subscribe, reconnectVersion } = useSocket();
    const [mapSummaryPanel, setMapSummaryPanel] = useState('');
    const [responderMapFilter, setResponderMapFilter] = useState('all');
    const [operationsDateKey, setOperationsDateKey] = useState(getManilaCalendarDateKey);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const historySectionRef = useRef(null);
    const reporterOverviewReportsRef = useRef(null);
    const reporterOverviewRequestRef = useRef(null);
    const reporterOverviewOwnerRef = useRef('');
    const isMapView = searchParams.get('view') === 'map';
    const panelView = searchParams.get('panel');

    // Memoize focusLocation from searchParams
    const focusLocation = useMemo(() => {
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        const zoom = searchParams.get('zoom');
        const pitch = searchParams.get('pitch');
        const bearing = searchParams.get('bearing');
        const delay = searchParams.get('delay');
        const duration = searchParams.get('duration');
        const requestId = searchParams.get('focus');
        if (lat && lng) {
            return {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                zoom: parseInt(zoom) || 16,
                pitch: pitch === null ? undefined : Number(pitch),
                bearing: bearing === null ? undefined : Number(bearing),
                delay: delay === null ? undefined : Number(delay),
                duration: duration === null ? undefined : Number(duration),
                requestId,
            };
        }
        return null;
    }, [searchParams]);

    const isReporter = user?.role === 'reporter';
    // Reporters see the shared public map data plus their own summary metrics.
    const canViewReports = isAuthenticated && user && !isReporter && user.role !== 'ordinary';
    const isAdmin = user?.role === 'municipal_admin';
    const isResponder = user?.role === 'responder';
    const hasMunicipality = (isAdmin || isResponder) && !!user?.assignedMunicipality;
    const activeMunicipality = hasMunicipality ? user.assignedMunicipality : null;

    const dashboardCacheKey = useMemo(() => getDashboardCacheKey({
        canViewReports, isAdmin, isResponder, isReporter, activeMunicipality, isAuthenticated,
    }), [canViewReports, isAdmin, isResponder, isReporter, activeMunicipality, isAuthenticated]);

    useEffect(() => {
        const ownerId = isReporter ? String(user?._id || user?.id || '') : '';
        if (reporterOverviewOwnerRef.current === ownerId) return;

        reporterOverviewOwnerRef.current = ownerId;
        reporterOverviewRequestRef.current = null;
        reporterOverviewReportsRef.current = null;
        const overviewKey = getReporterOverviewCacheKey(ownerId);
        const cachedOverview = ownerId && overviewKey ? getStaleData(overviewKey) : null;
        // Instant render from cache on account switch; no spinner on 2nd visit.
        setReporterOverviewReports(Array.isArray(cachedOverview) ? cachedOverview : null);
        if (Array.isArray(cachedOverview)) reporterOverviewReportsRef.current = cachedOverview;
        setReporterOverviewReportsLoading(false);
        setReporterOverviewReportsError('');
    }, [isReporter, user?._id, user?.id]);

    const loadReporterOverviewReports = useCallback(({ force = false } = {}) => {
        if (!isReporter) return Promise.resolve([]);
        const ownerId = String(user?._id || user?.id || '');
        if (!ownerId) return Promise.resolve([]);
        const overviewKey = getReporterOverviewCacheKey(ownerId);
        if (!force) {
            if (Array.isArray(reporterOverviewReportsRef.current)) {
                return Promise.resolve(reporterOverviewReportsRef.current);
            }
            const cached = overviewKey ? getCachedData(overviewKey, QUERY_CACHE_TTLS.reporterOverview) : null;
            if (Array.isArray(cached)) {
                reporterOverviewReportsRef.current = cached;
                setReporterOverviewReports(cached);
                setReporterOverviewReportsLoading(false);
                return Promise.resolve(cached);
            }
            const stale = overviewKey ? getStaleData(overviewKey) : null;
            if (Array.isArray(stale)) {
                reporterOverviewReportsRef.current = stale;
                setReporterOverviewReports(stale);
            }
        }
        if (reporterOverviewRequestRef.current) return reporterOverviewRequestRef.current;

        const requestOwnerId = String(user?._id || user?.id || '');
        const hasStaleOverview = overviewKey ? Array.isArray(getStaleData(overviewKey)) : false;
        // Stale data on screen: silent refresh without a spinner.
        if (!hasStaleOverview) setReporterOverviewReportsLoading(true);
        setReporterOverviewReportsError('');

        const request = dedupedFetch(overviewKey || `reporter-overview:${requestOwnerId}`, () => reportsAPI.getMyReports())
            .then((response) => {
                if (reporterOverviewOwnerRef.current !== requestOwnerId) return [];
                const payload = Array.isArray(response.data?.data) ? response.data.data : [];
                const ownedReports = deduplicateDashboardReports(payload).map((report) => ({
                    ...report,
                    isOwnedByCurrentUser: true,
                    detailAccess: 'owner',
                    detailCompleteness: 'full',
                }));
                reporterOverviewReportsRef.current = ownedReports;
                if (overviewKey) setCachedData(overviewKey, ownedReports);
                setReporterOverviewReports(ownedReports);
                return ownedReports;
            })
            .catch((requestError) => {
                if (reporterOverviewOwnerRef.current !== requestOwnerId) return [];
                console.error('Failed to load reporter overview records:', requestError);
                setReporterOverviewReportsError('Your report details are temporarily unavailable. Please try again.');
                return [];
            })
            .finally(() => {
                if (reporterOverviewOwnerRef.current === requestOwnerId) {
                    reporterOverviewRequestRef.current = null;
                    setReporterOverviewReportsLoading(false);
                }
            });

        reporterOverviewRequestRef.current = request;
        return request;
    }, [isReporter, user?._id, user?.id]);

    const updateLoadedReporterOverviewReport = useCallback((incomingReport) => {
        const incomingId = incomingReport?._id || incomingReport?.id;
        if (!incomingId) return;

        setReporterOverviewReports((current) => {
            if (!Array.isArray(current) || !current.some((report) => String(report._id || report.id) === String(incomingId))) {
                return current;
            }
            const updated = upsertDashboardReport(current, incomingReport);
            reporterOverviewReportsRef.current = updated;
            const ownerId = reporterOverviewOwnerRef.current;
            const overviewKey = getReporterOverviewCacheKey(ownerId);
            if (overviewKey) setCachedData(overviewKey, updated);
            return updated;
        });
    }, []);

    const removeLoadedReporterOverviewReport = useCallback((reportId) => {
        setReporterOverviewReports((current) => {
            if (!Array.isArray(current)) return current;
            const updated = removeDashboardReport(current, reportId);
            reporterOverviewReportsRef.current = updated;
            const ownerId = reporterOverviewOwnerRef.current;
            const overviewKey = getReporterOverviewCacheKey(ownerId);
            if (overviewKey) setCachedData(overviewKey, updated);
            return updated;
        });
    }, []);

    const dashboardReports = useMemo(() => {
        if (!activeMunicipality) return reports;
        return reports.filter((r) => (
            r.municipalityName === activeMunicipality
            || r.originalMunicipalityName === activeMunicipality
            || (Array.isArray(r.transferHistory) && r.transferHistory.some((t) => t?.fromMunicipalityName === activeMunicipality))
        ));
    }, [reports, activeMunicipality]);
    const focusedMapReportId = searchParams.get('report') || '';
    const focusedMapReport = useMemo(
        () => dashboardReports.find((report) => String(report._id) === focusedMapReportId) || null,
        [dashboardReports, focusedMapReportId],
    );
    const focusedRiskZoneId = normalizeRiskZoneId(searchParams.get('riskZone'));
    const focusedRiskZone = useMemo(
        () => findRiskZoneById(highRiskZones, focusedRiskZoneId),
        [highRiskZones, focusedRiskZoneId],
    );
    const returnToFocusedReport = useCallback(() => {
        if (!focusedMapReportId) return;
        const params = new URLSearchParams({ report: focusedMapReportId });
        const returnView = searchParams.get('returnView');
        if (returnView) params.set('view', returnView);
        navigate(`/admin/reports?${params.toString()}`);
    }, [focusedMapReportId, navigate, searchParams]);

    const isReportAssigned = useCallback((report) => {
        if (!report) return false;
        const hasResponders = Array.isArray(report.responders) && report.responders.length > 0;
        return hasResponders || !!report.respondedBy;
    }, []);

    const isAwaitingResponder = useCallback((report) => {
        if (!report) return false;
        if (report.status === 'transferred') return true;
        const awaitingStatuses = ['pending', 'verified'];
        return awaitingStatuses.includes(report.status) && !isReportAssigned(report);
    }, [isReportAssigned]);

    const canCurrentResponderResolve = useCallback((report) => {
        if (!isResponder || !user) return false;
        const currentUserId = (user._id || user.id)?.toString();
        const firstResponderId = report?.respondedBy?._id || report?.respondedBy;
        if (firstResponderId?.toString() === currentUserId) return true;

        return Boolean(report?.responders?.some((entry) => {
            const responderId = entry.user?._id || entry.user;
            return responderId?.toString() === currentUserId;
        }));
    }, [isResponder, user]);

    const hasMapCoordinates = useCallback((report) => {
        return Boolean(getMapCoordinates(report));
    }, []);

    const responderPendingReports = useMemo(
        () => dashboardReports.filter((r) => isAwaitingResponder(r) && hasMapCoordinates(r)),
        [dashboardReports, isAwaitingResponder, hasMapCoordinates]
    );

    const responderRespondingReports = useMemo(
        () => dashboardReports.filter((r) => r.status === 'responding' || (r.status === 'pending' && isReportAssigned(r))),
        [dashboardReports, isReportAssigned]
    );

    const computedResolvedTodayReports = useMemo(() => {
        return getResolvedTodayReports(dashboardReports, {
            currentUser: user,
            includeAll: isAdmin,
        });
    }, [isAdmin, dashboardReports, user, operationsDateKey]);

    useEffect(() => {
        let midnightTimer;

        const scheduleDayRollover = () => {
            const delay = getMillisecondsUntilNextManilaDay();
            if (delay === null) return;
            midnightTimer = window.setTimeout(() => {
                setOperationsDateKey(getManilaCalendarDateKey());
                scheduleDayRollover();
            }, delay + 250);
        };

        scheduleDayRollover();
        return () => window.clearTimeout(midnightTimer);
    }, []);

    const handleMapRespond = useCallback(async (report) => {
        if (!isResponder || !report?._id) {
            return { ok: false, message: 'Responder action only' };
        }

        try {
            const normalizedAgency = user?.agency === 'LGU' ? 'MDRRMO' : user?.agency;
            const unitPayload = {
                unitName: user?.responderUnit || `${normalizedAgency || 'MDRRMO'} - ${user?.assignedMunicipality || 'Sibuyan'}`,
                unitType: normalizedAgency || 'MDRRMO',
            };

            const response = await adminAPI.respondToReport(report._id, unitPayload);

            const refreshedReports = await fetchAllReportPages(adminAPI.getReports);
            setReports(refreshedReports);
            setCachedData(dashboardCacheKey, refreshedReports);
            navigate(`/admin/reports?view=active-responses&report=${encodeURIComponent(report._id)}`);

            return { ok: true, message: response.data?.message || 'Now responding to incident' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to respond to incident' };
        }
    }, [dashboardCacheKey, isResponder, navigate, user]);

    const handleMapResolve = useCallback(async (report) => {
        if (!isResponder || !report?._id) {
            return { ok: false, message: 'Responder action only' };
        }

        navigate(`/admin/reports?view=active-responses&report=${encodeURIComponent(report._id)}`);
        return { ok: true, message: 'Review the incident details before confirming resolution.' };
    }, [isResponder, navigate]);

    // Reporters use the shared map workspace without responder-only controls.

    // Publishable reports render on the shared map for every audience; fetch
    // every page instead of a single capped page so the dataset is never
    // silently truncated by the server's per-page limit.
    // Deduped by cache key so concurrent mounts share one network request.
    const loadPublicMapReports = useCallback(
        (cacheKey) => {
            const fetchKey = cacheKey || 'dashboard:public:guest';
            return dedupedFetch(fetchKey, () => fetchAllReportPages(reportsAPI.getAll, { status: 'all' }));
        },
        []
    );

    const loadDashboardReports = useCallback(async ({ silent = false, force = false } = {}) => {
        setDashboardError('');
        const handleReportLoadError = (error) => {
            console.error(error);
            // Keep stale map pins on screen; only block when we have nothing cached.
            if (getStaleData(dashboardCacheKey) === null) {
                setDashboardError('Some dashboard data could not be loaded. Please refresh and try again.');
            }
        };

        if (!force) {
            const fresh = getCachedData(dashboardCacheKey, QUERY_CACHE_TTLS.dashboard);
            if (Array.isArray(fresh)) {
                setReports(fresh);
                setLoading(false);
                return;
            }
        }
        const stale = getStaleData(dashboardCacheKey);
        const hasStale = Array.isArray(stale);
        if (hasStale && !silent) {
            // Instant render, silent refresh — removes the 2nd-visit skeleton.
            setReports(stale);
        }

        if (!silent && !hasStale) setLoading(true);
        try {
            let nextReports;
            if (canViewReports) {
                if (isAdmin || isResponder) {
                    nextReports = await dedupedFetch(dashboardCacheKey, () => fetchAllReportPages(adminAPI.getReports));
                } else {
                    // Fallback fetch
                    nextReports = await loadPublicMapReports(dashboardCacheKey);
                }

                // Responder dashboard cards rely on roleStats; fetch it in this branch too.
                if (isResponder) {
                    analyticsAPI.getResponder()
                        .then(res => setRoleStats(res.data.data))
                        .catch(err => console.error(err));
                }
            } else if (isAuthenticated && (isReporter || isResponder)) {
                // Reporters & responders: fetch verified reports for the map display
                nextReports = await loadPublicMapReports(dashboardCacheKey);

                // Fetch role-specific analytics
                if (isResponder) {
                    analyticsAPI.getResponder().then(res => setRoleStats(res.data.data)).catch(console.error);
                } else if (isReporter) {
                    analyticsAPI.getReporter().then(res => setRoleStats(res.data.data)).catch(console.error);
                }
            } else {
                // Public/ordinary users: fetch public map data
                nextReports = await loadPublicMapReports(dashboardCacheKey);
            }
            setReports(nextReports);
            setCachedData(dashboardCacheKey, nextReports);
        } catch (error) {
            handleReportLoadError(error);
        } finally {
            if (!silent && !hasStale) setLoading(false);
            else setLoading(false);
        }
    }, [dashboardCacheKey, canViewReports, isAuthenticated, isAdmin, isReporter, isResponder, loadPublicMapReports]);

    useEffect(() => {
        // Fresh cache: skip network. Stale cache: handled inside loader
        // (instant render + silent refresh). No cache: full load with spinner.
        if (getCachedData(dashboardCacheKey, QUERY_CACHE_TTLS.dashboard) !== null) {
            loadDashboardReports({ force: false });
            return;
        }
        if (getStaleData(dashboardCacheKey) !== null) {
            loadDashboardReports({ silent: true });
            return;
        }
        loadDashboardReports();
    }, [loadDashboardReports, dashboardCacheKey]);

    // Resync from the server after a socket reconnect so events missed while
    // offline self-heal without requiring a page refresh.
    useEffect(() => {
        if (reconnectVersion === 0) return;
        loadDashboardReports({ silent: true });
        if (isReporter && reporterOverviewReportsRef.current) {
            loadReporterOverviewReports({ force: true });
        }
    }, [isReporter, loadDashboardReports, loadReporterOverviewReports, reconnectVersion]);

    useEffect(() => {
        if (!isResponder) {
            setResponderMapFilter('all');
        }
    }, [isResponder]);


    // Filter reports by municipality on the client side
    const filteredReports = dashboardReports;

    // Further filter by selected month for analytics
    const monthFilteredReports = useMemo(() => {
        return filteredReports.filter(r => {
            try {
                return isSameMonth(parseISO(r.createdAt), selectedMonth);
            } catch {
                return false;
            }
        });
    }, [filteredReports, selectedMonth]);

    // Real-time map updates (including public viewers)
    useEffect(() => {
        const isOperationalUser = Boolean(
            user?.role && ['municipal_admin', 'responder', 'admin', 'system_admin'].includes(user.role)
        );

        const normalizeIncomingReport = (report) => {
            if (!report) return null;
            const id = report._id || report.id;
            if (!id) return null;

            const now = new Date().toISOString();
            const sanitized = {
                ...report,
                _id: id,
                incidentCategory: report.incidentCategory || report.category,
                incidentType: report.incidentType || report.type,
                municipalityName: report.municipalityName || report.municipality,
                createdAt: report.createdAt || report.timestamp || report.incidentTime || now,
                incidentTime: report.incidentTime || report.createdAt || report.timestamp || now,
            };

            // Public / guest / unauthorized client sanitization
            if (!isOperationalUser) {
                const currentUserId = user?._id || user?.id;
                const reporterId = report.reporter?._id || report.reporter?.id || report.reporter;
                const isOwner = Boolean(currentUserId && reporterId && String(currentUserId) === String(reporterId));

                if (!isOwner) {
                    delete sanitized.images;
                    if (sanitized.evidence) {
                        sanitized.evidence = {
                            ...sanitized.evidence,
                            viewerAccess: 'redacted',
                            items: Array.isArray(sanitized.evidence.items)
                                ? sanitized.evidence.items.map((it, idx) => {
                                    const redactionVersion = '3.4';
                                    const previewUrl = `/api/reports/${id}/evidence/${it.index ?? idx}/preview?rv=${redactionVersion}`;

                                    return {
                                        id: String(it.id ?? idx),
                                        index: it.index ?? idx,
                                        redactedPreviewUrl: previewUrl,
                                        previewUrl,
                                        accessLevel: 'redacted',
                                        detectionStatus: 'privacy_derivative',
                                        redactionType: 'public_soft_blur',
                                        redactionVersion,
                                        detectorVersion,
                                        alt: it.alt || `Incident evidence photo ${idx + 1}, privacy-safe preview`,
                                    };
                                })
                                : [],
                        };
                    }
                }
            }

            return sanitized;
        };


        const upsertAndCache = (normalized) => {
            if (!normalized) return;
            setReports((previous) => upsertDashboardReport(previous, normalized));
            const base = getStaleData(dashboardCacheKey) || [];
            setCachedData(dashboardCacheKey, upsertDashboardReport(base, normalized));
        };
        const removeAndCache = (id) => {
            if (!id) return;
            setReports((previous) => removeDashboardReport(previous, id));
            const base = getStaleData(dashboardCacheKey) || [];
            setCachedData(dashboardCacheKey, removeDashboardReport(base, id));
        };
        const patchStatusAndCache = (id, status) => {
            if (!id) return;
            setReports((previous) => updateDashboardReportStatus(previous, id, status));
            const base = getStaleData(dashboardCacheKey) || [];
            setCachedData(dashboardCacheKey, updateDashboardReportStatus(base, id, status));
        };

        const unsub0 = subscribe('newReport', (data) => {
            upsertAndCache(normalizeIncomingReport(data));
        });

        const unsub1 = subscribe('reportVerified', (report) => {
            const normalized = normalizeIncomingReport({ ...report, status: 'verified' });
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub2 = subscribe('reportResponded', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'responding',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub3 = subscribe('reportResolved', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'resolved',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'resolved',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub4 = subscribe('reportDeleted', (data) => {
            removeAndCache(data?.id ?? data?._id);
            removeLoadedReporterOverviewReport(data?.id ?? data?._id);
        });
        const unsub8 = subscribe('reportTransferred', (data) => {
            const normalized = normalizeIncomingReport({
                ...data,
                status: 'transferred',
                municipalityName: data.toMunicipality || data.municipalityName,
                transferHistory: [
                    ...(Array.isArray(data.transferHistory) ? data.transferHistory : []),
                    ...(data.fromMunicipality ? [{
                        fromMunicipalityName: data.fromMunicipality,
                        toMunicipalityName: data.toMunicipality || data.municipalityName,
                    }] : []),
                ],
            });
            if (!normalized) return;
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub9 = subscribe('reportRejectedUpdate', (data) => {
            if (!data?.id) return;
            patchStatusAndCache(data.id, 'rejected');
            updateLoadedReporterOverviewReport({ ...data, _id: data.id, status: 'rejected' });
        });

        // Reporter-scoped rejection (delivered to the reporter's user room).
        // Mirrors the rejection into the loaded reporter overview; operational
        // viewers receive the equivalent reportRejectedUpdate above.
        const unsubReporterRejected = subscribe('reportRejected', (data) => {
            if (!data?.id) return;
            updateLoadedReporterOverviewReport({ ...data, _id: data.id, status: 'rejected' });
        });

        return () => {
            unsub0();
            unsub1();
            unsub2();
            unsub3();
            unsubResolutionDetails();
            unsub4();
            unsub8();
            unsub9();
            unsubReporterRejected();
        };
    }, [dashboardCacheKey, removeLoadedReporterOverviewReport, subscribe, updateLoadedReporterOverviewReport]);

    useEffect(() => {
        if (panelView === 'incidents') {
            setMapSummaryPanel('incidents');
        }
        if (panelView === 'zones') {
            setMapSummaryPanel('zones');
        }
        if (panelView === 'history' && historySectionRef.current) {
            historySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [panelView]);

    // ===== COMPUTED DATA =====

    const chartData = useMemo(() => {
        return buildDailyIncidentTrend({
            reports: monthFilteredReports,
            selectedMonth,
        });
    }, [monthFilteredReports, selectedMonth]);

    // Status breakdown
    const statusData = useMemo(() => {
        const counts = { pending: 0, verified: 0, transferred: 0, responding: 0, resolved: 0, rejected: 0 };
        monthFilteredReports.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value,
                color: MAP_STATUS_CONFIG[name].markerColor,
            }));
    }, [monthFilteredReports]);



    // Municipality breakdown for bar chart
    const municipalityBarData = useMemo(() => {
        const counts = {};
        monthFilteredReports.forEach(r => {
            const name = r.municipalityName || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [monthFilteredReports]);

    // Barangay breakdown for bar chart
    const barangayBarData = useMemo(() => {
        const counts = {};
        monthFilteredReports.forEach(r => {
            if (r.barangay) {
                const name = activeMunicipality
                    ? r.barangay
                    : `${r.barangay}${r.municipalityName ? ` (${r.municipalityName})` : ''}`;
                counts[name] = (counts[name] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [monthFilteredReports, activeMunicipality]);

    const incidentTypeBarData = useMemo(() => {
        const counts = {};
        monthFilteredReports.forEach((report) => {
            const rawType = report.incidentType || report.incidentCategory || 'Unspecified';
            const name = rawType
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, (character) => character.toUpperCase());
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [monthFilteredReports]);

    // Response performance metrics
    const performanceMetrics = useMemo(() => {
        const responseMinutes = monthFilteredReports
            .filter(r => r.respondedAt && r.createdAt)
            .map(r => differenceInMinutes(new Date(r.respondedAt), new Date(r.createdAt)))
            .filter(minutes => Number.isFinite(minutes) && minutes >= 0)
            .sort((a, b) => a - b);
        const resolvedReports = monthFilteredReports.filter(r => r.status === 'resolved');
        const respondingReports = monthFilteredReports.filter(r => r.status === 'responding');
        const pendingCount = monthFilteredReports.filter(r => r.status === 'pending').length;
        const dispatchReadyCount = monthFilteredReports.filter(r => (
            ['verified', 'transferred'].includes(r.status) && !isReportAssigned(r)
        )).length;

        const avgResponseMin = responseMinutes.length
            ? Math.round(responseMinutes.reduce((sum, minutes) => sum + minutes, 0) / responseMinutes.length)
            : null;
        const middleIndex = Math.floor(responseMinutes.length / 2);
        const medianResponseMin = responseMinutes.length
            ? Math.round(responseMinutes.length % 2
                ? responseMinutes[middleIndex]
                : (responseMinutes[middleIndex - 1] + responseMinutes[middleIndex]) / 2)
            : null;

        // Resolution rate
        const totalActionable = monthFilteredReports.filter(r => ['verified', 'transferred', 'responding', 'resolved'].includes(r.status)).length;
        const resolutionRate = totalActionable > 0 ? Math.round((resolvedReports.length / totalActionable) * 100) : 0;

        return {
            avgResponseMin,
            medianResponseMin,
            responseSampleCount: responseMinutes.length,
            resolvedCount: resolvedReports.length,
            respondingCount: respondingReports.length,
            pendingCount,
            dispatchReadyCount,
            resolutionRate,
        };
    }, [isReportAssigned, monthFilteredReports]);


    const showMapWorkspace = !isAdmin || isResponder || isMapView;

    if (showMapWorkspace) {
        return (
            <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="spinner" /></div>}>
                <DashboardMapWorkspace
                    user={user}
                    isAuthenticated={isAuthenticated}
                    isAdmin={isAdmin}
                    isResponder={isResponder}
                    isReporter={isReporter}
                    loading={loading}
                    error={dashboardError}
                    reports={dashboardReports}
                    pendingReports={responderPendingReports}
                    respondingReports={responderRespondingReports}
                    resolvedTodayReports={computedResolvedTodayReports}
                    highRiskZones={highRiskZones}
                    highRiskZonesLoading={highRiskZonesLoading}
                    highRiskZonesError={highRiskZonesError}
                    onRetryHighRiskZones={refreshHighRiskZones}
                    roleStats={roleStats}
                    reporterOverviewReports={reporterOverviewReports}
                    reporterOverviewReportsLoading={reporterOverviewReportsLoading}
                    reporterOverviewReportsError={reporterOverviewReportsError}
                    onLoadReporterOverviewReports={loadReporterOverviewReports}
                    focusLocation={focusLocation}
                    focusedReport={focusedMapReport}
                    focusedRiskZone={focusedRiskZone}
                    onReturnToReport={focusedMapReportId ? returnToFocusedReport : null}
                    responderMapFilter={responderMapFilter}
                    setResponderMapFilter={setResponderMapFilter}
                    canCurrentResponderResolve={canCurrentResponderResolve}
                    handleMapRespond={handleMapRespond}
                    handleMapResolve={handleMapResolve}
                    setSearchParams={setSearchParams}
                    mapSummaryPanel={mapSummaryPanel}
                    setMapSummaryPanel={setMapSummaryPanel}
                    activePanel={panelView}
                />
            </Suspense>
        );
    }


    return (
        <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="spinner" /></div>}>
            <DashboardAnalyticsWorkspace
                user={user}
                hasMunicipality={hasMunicipality}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                reports={monthFilteredReports}
                allReports={dashboardReports}
                highRiskZones={highRiskZones}
                performanceMetrics={performanceMetrics}
                chartData={chartData}
                statusData={statusData}
                municipalityBarData={municipalityBarData}
                barangayBarData={barangayBarData}
                incidentTypeBarData={incidentTypeBarData}
                dashboardReports={dashboardReports}
                focusLocation={focusLocation}
                historySectionRef={historySectionRef}
                loading={loading}
                error={dashboardError}
                onOpenMap={() => setSearchParams({ view: 'map' })}
                onOpenReports={() => navigate('/admin/reports')}
            />
        </Suspense>
    );
};

export default DashboardPage;
