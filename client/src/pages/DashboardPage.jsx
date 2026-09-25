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
import { getPhysicalMunicipality } from '../utils/incidentDetails';
import {
    DEFAULT_MAP_SCOPE,
    MAP_SCOPE_ISLAND,
    getIslandMapScopeCacheKey,
    mergeMapScopeReports,
    normalizeMapScope,
} from '../utils/mapScope';
import { findRiskZoneById, normalizeRiskZoneId } from '../utils/riskZoneNavigation';
import { MAP_STATUS_CONFIG } from '../config/mapVisuals';
import DashboardViewSwitch from '../components/dashboard/DashboardViewSwitch';
import { MAP_DEFAULT_FILTER } from '../config/mapExperience';
import {
    DASHBOARD_MAP_VIEW,
    canViewAnalytics,
    resolveDashboardView,
} from '../utils/dashboardView';
import { withoutFocusedEntity } from '../utils/dashboardFocus';
import { ANALYTICS_SCOPE, buildPeriodIncidentTrend } from '../utils/analyticsTrend';
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
    isRecentlyRevalidated,
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

// Fresh-event pulse visibility window: 4 ring iterations at 1.2s each.
const PULSE_DURATION_MS = 5000;

const DashboardPage = () => {
    const { user, isAuthenticated } = useAuth();
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

    const [reports, setReports] = useState(() => {
        const cached = getStaleData(dashboardCacheKey);
        return Array.isArray(cached) ? cached : [];
    });
    const [pulseReportIds, setPulseReportIds] = useState([]);
    const pulseTimeoutsRef = useRef(new Map());
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
    const [loading, setLoading] = useState(() => {
        const cached = getStaleData(dashboardCacheKey);
        return !Array.isArray(cached);
    });
    const [dashboardError, setDashboardError] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    // The analytics reporting scope. Monthly is the original behaviour and stays
    // the default, so every existing deep link and test keeps the view it had.
    const [analyticsScope, setAnalyticsScope] = useState(ANALYTICS_SCOPE.MONTHLY);
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
    const { subscribe, reconnectVersion } = useSocket();
    // The map's view state. Which tab the map opens on is the role's own answer
    // (mapExperience.defaultFilter); this is only this page's copy of it, and the
    // map workspace resets both on every arrival it owns (see its layout effect).
    const [mapSummaryPanel, setMapSummaryPanel] = useState('');
    const [responderMapFilter, setResponderMapFilter] = useState(MAP_DEFAULT_FILTER);
    // Map scope is WHERE the map draws, not what the account may see or do — see
    // `utils/mapScope`. The municipality always comes from the session, and the
    // map opens on it, so the current workflow (and the map's density) is what an
    // administrator sees by default. Only `municipal_admin` gets the control.
    const [mapScope, setMapScope] = useState(DEFAULT_MAP_SCOPE);
    const [islandScopeReports, setIslandScopeReports] = useState(null);
    const [islandScopeLoading, setIslandScopeLoading] = useState(false);
    const [islandScopeError, setIslandScopeError] = useState('');
    const islandScopeRequestRef = useRef(null);
    // Mirrors the state so the socket write-through can read the loaded island set
    // without being re-created (and re-subscribing every socket listener) on each
    // change, and `null` is load-bearing: it means "never asked for", which is
    // what keeps an idle map from paying for a fetch it did not request.
    const islandScopeReportsRef = useRef(null);
    const activeMapScope = isAdmin ? normalizeMapScope(mapScope) : DEFAULT_MAP_SCOPE;
    const islandScopeCacheKey = getIslandMapScopeCacheKey({
        municipality: user?.assignedMunicipality,
        userId: user?._id || user?.id,
    });
    const [operationsDateKey, setOperationsDateKey] = useState(getManilaCalendarDateKey);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const historySectionRef = useRef(null);
    const reporterOverviewReportsRef = useRef(null);
    const reporterOverviewRequestRef = useRef(null);
    const reporterOverviewOwnerRef = useRef('');
    const requestedView = searchParams.get('view');
    const panelView = searchParams.get('panel');

    // /dashboard is the incident map for everyone. Analytics is a
    // municipal_admin surface, opted into with ?view=analytics (or the history
    // deep link, which only the analytics workspace understands).
    //
    // The map used to be the opt-in half (?view=map) and analytics the default,
    // so the one role with incidents to triage landed on charts while guests,
    // reporters, and responders landed on the map. Nothing is lost by flipping
    // it: every existing ?view=map link still resolves to the map, and analytics
    // gained a URL of its own that reflects who may open it.
    //
    // The rule itself lives in utils/dashboardView so the sidebar highlights the
    // same view this page renders.
    const canOpenAnalytics = canViewAnalytics(user?.role);
    const dashboardView = resolveDashboardView({
        role: user?.role,
        requestedView,
        panelView,
    });

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
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
            const parsedZoom = zoom === null ? 16 : parseInt(zoom, 10);
            const parsedPitch = pitch === null ? undefined : Number(pitch);
            const parsedBearing = bearing === null ? undefined : Number(bearing);
            const parsedDelay = delay === null ? undefined : Number(delay);
            const parsedDuration = duration === null ? undefined : Number(duration);
            return {
                lat: parsedLat,
                lng: parsedLng,
                zoom: Number.isFinite(parsedZoom) ? parsedZoom : 16,
                pitch: Number.isFinite(parsedPitch) ? parsedPitch : undefined,
                bearing: Number.isFinite(parsedBearing) ? parsedBearing : undefined,
                delay: Number.isFinite(parsedDelay) ? parsedDelay : undefined,
                duration: Number.isFinite(parsedDuration) ? parsedDuration : undefined,
                requestId,
            };
        }
        return null;
    }, [searchParams]);

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
        return (Array.isArray(reports) ? reports : []).filter(Boolean).filter((r) => (
            r?.municipalityName === activeMunicipality
            || r?.originalMunicipalityName === activeMunicipality
            || (Array.isArray(r?.transferHistory) && r.transferHistory.some((t) => t?.fromMunicipalityName === activeMunicipality))
        ));
    }, [reports, activeMunicipality]);

    /**
     * The island-wide set, fetched only when the administrator asks for it.
     *
     * It is the public map feed, not a new administrative endpoint: every signed-in
     * member already receives it, its projection is an allowlist with redacted
     * evidence and no reporter identity, and it carries no operational fields. The
     * administrator's own municipality is layered over it (see
     * `mergeMapScopeReports`), so nothing they can act on becomes weaker in the
     * wider view. Fetched once per TTL rather than per toggle, and deduped, so
     * flipping the control never re-requests what is already on hand.
     */
    const loadIslandScopeReports = useCallback(({ force = false } = {}) => {
        if (!isAdmin) return Promise.resolve([]);

        if (!force) {
            const fresh = getCachedData(islandScopeCacheKey, QUERY_CACHE_TTLS.dashboard);
            if (Array.isArray(fresh)) {
                // A read never re-stamps the entry: re-caching here would push the
                // TTL forward on every toggle and the island set would never refresh.
                islandScopeReportsRef.current = fresh;
                setIslandScopeReports(fresh);
                setIslandScopeLoading(false);
                return Promise.resolve(fresh);
            }
            const stale = getStaleData(islandScopeCacheKey);
            if (Array.isArray(stale)) {
                // Instant render from cache, then refresh silently below.
                islandScopeReportsRef.current = stale;
                setIslandScopeReports(stale);
            }
        }
        if (islandScopeRequestRef.current) return islandScopeRequestRef.current;

        const hasStale = Array.isArray(getStaleData(islandScopeCacheKey));
        if (!hasStale) setIslandScopeLoading(true);
        setIslandScopeError('');

        const request = dedupedFetch(islandScopeCacheKey, () => (
            fetchAllReportPages(reportsAPI.getAll, { status: 'all' })
        ))
            .then((records) => {
                const nextIslandReports = Array.isArray(records) ? records.filter(Boolean) : [];
                islandScopeReportsRef.current = nextIslandReports;
                setCachedData(islandScopeCacheKey, nextIslandReports);
                setIslandScopeReports(nextIslandReports);
                return nextIslandReports;
            })
            .catch((requestError) => {
                console.error('Failed to load island-wide incidents:', requestError);
                // Only surface the failure when there is nothing to draw; a stale
                // snapshot stays on screen rather than being replaced by an error.
                if (!Array.isArray(getStaleData(islandScopeCacheKey))) {
                    setIslandScopeError('Island-wide incidents are temporarily unavailable. Please try again.');
                }
                return [];
            })
            .finally(() => {
                islandScopeRequestRef.current = null;
                setIslandScopeLoading(false);
            });

        islandScopeRequestRef.current = request;
        return request;
    }, [isAdmin, islandScopeCacheKey]);

    useEffect(() => {
        if (activeMapScope !== MAP_SCOPE_ISLAND) return;
        loadIslandScopeReports();
    }, [activeMapScope, loadIslandScopeReports]);

    // A sign-out on this page, or a different account signing in, must not leave
    // one office's island-wide snapshot (or their scope choice) behind for the
    // next one. The scope itself resets to the new account's own municipality.
    useEffect(() => {
        setMapScope(DEFAULT_MAP_SCOPE);
        setIslandScopeReports(null);
        setIslandScopeLoading(false);
        setIslandScopeError('');
        islandScopeRequestRef.current = null;
        islandScopeReportsRef.current = null;
    }, [user?._id, user?.id, user?.assignedMunicipality]);

    const mapScopedReports = useMemo(() => mergeMapScopeReports({
        scope: activeMapScope,
        municipalityReports: dashboardReports,
        islandReports: islandScopeReports,
    }), [activeMapScope, dashboardReports, islandScopeReports]);
    // Live write-through for the island set, mirroring what the socket handlers do
    // for the operational one: a verified, responded, resolved, deleted or
    // transferred incident must move the marker it draws, not wait for a refetch.
    // A no-op until the island set has been loaded at least once, so nothing here
    // can trigger the fetch the control exists to gate.
    const applyIslandScopeUpdate = useCallback((update) => {
        const current = islandScopeReportsRef.current;
        if (!Array.isArray(current) || typeof update !== 'function') return;
        const next = update(current);
        islandScopeReportsRef.current = next;
        setCachedData(islandScopeCacheKey, next);
        setIslandScopeReports(next);
    }, [islandScopeCacheKey]);

    const focusedMapReportId = searchParams.get('report') || '';
    // Deep-link guarantee: the preloaded list can miss the target (own pending
    // reports for reporters, municipality-filtered admin lists, stale cache).
    // Fall back to a direct RBAC-enforced fetch so a search tap always lands.
    const [focusedReportFallback, setFocusedReportFallback] = useState(null);
    const [focusedReportMissing, setFocusedReportMissing] = useState(false);
    const focusedFetchRef = useRef('');
    useEffect(() => {
        if (!focusedMapReportId) {
            focusedFetchRef.current = '';
            setFocusedReportFallback(null);
            setFocusedReportMissing(false);
            return;
        }
        const inList = (Array.isArray(mapScopedReports) ? mapScopedReports : [])
            .some((report) => String(report?._id) === focusedMapReportId);
        if (inList) {
            focusedFetchRef.current = focusedMapReportId;
            setFocusedReportFallback(null);
            setFocusedReportMissing(false);
            return;
        }
        if (focusedFetchRef.current === focusedMapReportId) return;
        focusedFetchRef.current = focusedMapReportId;
        let cancelled = false;
        setFocusedReportFallback(null);
        setFocusedReportMissing(false);
        reportsAPI.getById(focusedMapReportId)
            .then((response) => {
                if (cancelled) return;
                const data = response?.data?.data;
                if (data && typeof data === 'object') {
                    setFocusedReportFallback(data);
                } else {
                    setFocusedReportMissing(true);
                }
            })
            .catch(() => {
                if (!cancelled) setFocusedReportMissing(true);
            });
        return () => {
            cancelled = true;
        };
    }, [focusedMapReportId, mapScopedReports]);
    const focusedMapReport = useMemo(
        () => mapScopedReports.find((report) => String(report?._id) === focusedMapReportId)
            || focusedReportFallback,
        [focusedMapReportId, focusedReportFallback, mapScopedReports],
    );
    const focusedRiskZoneId = normalizeRiskZoneId(searchParams.get('riskZone'));
    const focusedRiskZone = useMemo(
        () => findRiskZoneById(highRiskZones, focusedRiskZoneId),
        [highRiskZones, focusedRiskZoneId],
    );

    /**
     * Drop the record this URL is focused on.
     *
     * A search result lands on `?view=map&report=<id>` or `?riskZone=<id>`, and
     * the URL is where that focus lives — the two values above are read from it,
     * and the map treats the named record as what it was asked to show: it flies
     * the camera there, draws its pin outside the active filter, and opens its
     * details. Correct on arrival, wrong the moment the viewer says what the map
     * should show instead, which is why the map workspace calls this on every
     * scope change (see `selectMapFilter`).
     *
     * The rule about WHICH keys go, and why a no-op returns null, lives in
     * `utils/dashboardFocus` — the page's only job here is to hand the router a
     * new query.
     */
    const clearFocusedEntity = useCallback(() => {
        const nextParams = withoutFocusedEntity(searchParams);
        if (!nextParams) return;
        setSearchParams(nextParams);
    }, [searchParams, setSearchParams]);

    const isReportAssigned = useCallback((report) => {
        if (!report) return false;
        const hasResponders = Array.isArray(report.responders) && report.responders.length > 0;
        return hasResponders || !!report.respondedBy;
    }, []);

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

    const computedResolvedTodayReports = useMemo(() => {
        return getResolvedTodayReports(mapScopedReports, {
            currentUser: user,
            includeAll: isAdmin,
        });
    }, [isAdmin, mapScopedReports, user, operationsDateKey]);

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

    // Acknowledging a transfer is the receiving municipality's first act on an
    // incident handed to it: it is the moment the record stops reading as
    // "waiting on us". Same shape as `handleMapRespond` — call, refetch, hand the
    // message back — because the map's footer reports the result the same way for
    // every panel action.
    const handleMapAcknowledgeTransfer = useCallback(async (report) => {
        if (!isAdmin || !report?._id) {
            return { ok: false, message: 'Administrator action only' };
        }

        try {
            const response = await adminAPI.acknowledgeTransfer(report._id);
            const refreshedReports = await fetchAllReportPages(adminAPI.getReports);
            setReports(refreshedReports);
            setCachedData(dashboardCacheKey, refreshedReports);

            return { ok: true, message: response.data?.message || 'Transfer acknowledged' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to acknowledge transfer' };
        }
    }, [dashboardCacheKey, isAdmin]);

    const handleMapResolve = useCallback(async (report) => {
        if (!isResponder || !report?._id) {
            return { ok: false, message: 'Responder action only' };
        }

        navigate(`/admin/reports?view=active-responses&report=${encodeURIComponent(report._id)}`);
        return { ok: true, message: 'Review the incident details before confirming resolution.' };
    }, [isResponder, navigate]);

    // Map review shortcuts (municipal_admin only): the actual verify/reject
    // confirmation lives in the incident queue inspector, so the map hands
    // off with a deep link that auto-opens the report there. Scope and
    // pending-status rules are re-checked in the workspace before showing
    // the buttons, and again server-side on confirm.
    const openMapReview = useCallback((report, actionLabel) => {
        if (!isAdmin || !report?._id) {
            return { ok: false, message: 'Administrator review only' };
        }
        navigate(`/admin/reports?report=${encodeURIComponent(report._id)}`);
        return { ok: true, message: actionLabel };
    }, [isAdmin, navigate]);

    const handleMapVerify = useCallback((report) => (
        openMapReview(report, 'Opening verification review')
    ), [openMapReview]);

    const handleMapReject = useCallback((report) => (
        openMapReview(report, 'Opening rejection review')
    ), [openMapReview]);

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
            const cachedOnError = getStaleData(dashboardCacheKey);
            if (!Array.isArray(cachedOnError)) {
                setDashboardError('Some dashboard data could not be loaded. Please refresh and try again.');
            }
        };

        const stale = getStaleData(dashboardCacheKey);
        const hasStale = Array.isArray(stale) && stale.length > 0;
        if (hasStale) {
            // Instant render from cache (0ms, no skeleton)
            setReports(stale);
            setLoading(false);
        } else if (!silent) {
            setLoading(true);
        }

        // Avoid micro-burst revalidation within 4 seconds unless forced or cold
        if (!force && hasStale && isRecentlyRevalidated(dashboardCacheKey, 4000)) {
            return;
        }

        try {
            let nextReports;
            if (canViewReports) {
                if (isAdmin || isResponder) {
                    nextReports = await dedupedFetch(dashboardCacheKey, () => fetchAllReportPages(adminAPI.getReports));
                } else {
                    // Fallback fetch
                    nextReports = await loadPublicMapReports(dashboardCacheKey);
                }

                // Dashboard cards rely on roleStats; fetch it in this branch too.
                if (isResponder) {
                    analyticsAPI.getResponder()
                        .then((res) => {
                            const stats = res?.data?.data;
                            setRoleStats(stats && typeof stats === 'object' ? stats : null);
                        })
                        .catch(err => console.error(err));
                }
            } else if (isAuthenticated && (isReporter || isResponder)) {
                // Reporters & responders: fetch verified reports for the map display
                nextReports = await loadPublicMapReports(dashboardCacheKey);

                // Fetch role-specific analytics
                if (isResponder) {
                    analyticsAPI.getResponder().then((res) => {
                        const stats = res?.data?.data;
                        setRoleStats(stats && typeof stats === 'object' ? stats : null);
                    }).catch(console.error);
                } else if (isReporter) {
                    analyticsAPI.getReporter().then((res) => {
                        const stats = res?.data?.data;
                        setRoleStats(stats && typeof stats === 'object' ? stats : null);
                    }).catch(console.error);
                }
            } else {
                // Public/ordinary users: fetch public map data
                nextReports = await loadPublicMapReports(dashboardCacheKey);
            }
            // fetchAllReportPages always resolves to an array, but guard against
            // flat-array / envelope shape regressions so downstream filters never throw.
            if (!Array.isArray(nextReports)) nextReports = [];
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

    // A role change without a remount (a sign-out on this page) must not leave
    // one account's selected tab behind for the next one.
    useEffect(() => {
        if (!isResponder) {
            setResponderMapFilter(MAP_DEFAULT_FILTER);
        }
    }, [isResponder]);


    // Filter reports by municipality on the client side
    const filteredReports = dashboardReports;

    // Further filter by the active reporting scope. Monthly keeps the original
    // month match; Yearly widens it to a calendar year; All time applies no
    // period filter at all. One place decides, because every panel below —
    // metrics, lifecycle, breakdowns, the map, and the export — reads this set.
    const periodReports = useMemo(() => {
        const source = (Array.isArray(filteredReports) ? filteredReports : []).filter(Boolean);
        if (analyticsScope === ANALYTICS_SCOPE.ALL_TIME) return source;
        return source.filter((report) => {
            try {
                if (!report?.createdAt) return false;
                const reportedAt = parseISO(report.createdAt);
                if (analyticsScope === ANALYTICS_SCOPE.YEARLY) {
                    return reportedAt.getFullYear() === selectedYear;
                }
                return isSameMonth(reportedAt, selectedMonth);
            } catch {
                return false;
            }
        });
    }, [filteredReports, analyticsScope, selectedMonth, selectedYear]);

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
                // Explicit ownership: map detail and scope checks read this flag
                // to decide between owner and redacted treatment. Never leave it
                // undefined, or owned rows silently render as someone else's.
                sanitized.isOwnedByCurrentUser = isOwner;

                if (!isOwner) {
                    delete sanitized.images;
                    if (sanitized.evidence) {
                        sanitized.evidence = {
                            ...sanitized.evidence,
                            viewerAccess: 'redacted',
                            items: Array.isArray(sanitized.evidence.items)
                                ? sanitized.evidence.items.map((it, idx) => {
                                    const redactionVersion = '3.4';
                                    const detectorVersion = '2.3';
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
            const cached = getStaleData(dashboardCacheKey);
            const base = Array.isArray(cached) ? cached : [];
            setCachedData(dashboardCacheKey, upsertDashboardReport(base, normalized));
            applyIslandScopeUpdate((islandBase) => upsertDashboardReport(islandBase, normalized));
        };
        // Fresh-event pulse registry: ids whose map markers ring for a few
        // seconds after a socket event. Self-expiring via timeout.
        const pulseReport = (id) => {
            const key = id === null || id === undefined ? '' : String(id);
            if (!key) return;
            setPulseReportIds((current) => (current.includes(key) ? current : [...current, key]));
            window.clearTimeout(pulseTimeoutsRef.current.get(key));
            pulseTimeoutsRef.current.set(key, window.setTimeout(() => {
                pulseTimeoutsRef.current.delete(key);
                setPulseReportIds((current) => current.filter((item) => item !== key));
            }, PULSE_DURATION_MS));
        };
        const removeAndCache = (id) => {
            if (!id) return;
            setReports((previous) => removeDashboardReport(previous, id));
            const cached = getStaleData(dashboardCacheKey);
            const base = Array.isArray(cached) ? cached : [];
            setCachedData(dashboardCacheKey, removeDashboardReport(base, id));
            applyIslandScopeUpdate((islandBase) => removeDashboardReport(islandBase, id));
        };
        const patchStatusAndCache = (id, status) => {
            if (!id) return;
            setReports((previous) => updateDashboardReportStatus(previous, id, status));
            const cached = getStaleData(dashboardCacheKey);
            const base = Array.isArray(cached) ? cached : [];
            setCachedData(dashboardCacheKey, updateDashboardReportStatus(base, id, status));
            applyIslandScopeUpdate((islandBase) => updateDashboardReportStatus(islandBase, id, status));
        };

        const unsub0 = subscribe('newReport', (data) => {
            if (!data || typeof data !== 'object') return;
            const normalized = normalizeIncomingReport(data);
            upsertAndCache(normalized);
            pulseReport(normalized?._id);
        });

        const unsub1 = subscribe('reportVerified', (report) => {
            if (!report || typeof report !== 'object') return;
            const normalized = normalizeIncomingReport({ ...report, status: 'verified' });
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
            pulseReport(normalized?._id);
        });
        const unsub2 = subscribe('reportResponded', (data) => {
            if (!data || typeof data !== 'object') return;
            const respondedId = data?.id ?? data?._id;
            if (!respondedId) return;
            const normalized = {
                ...data,
                _id: respondedId,
                status: 'responding',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
            pulseReport(respondedId);
        });
        const unsub3 = subscribe('reportResolved', (data) => {
            if (!data || typeof data !== 'object') return;
            const resolvedId = data?.id ?? data?._id;
            if (!resolvedId) return;
            const normalized = {
                ...data,
                _id: resolvedId,
                status: 'resolved',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
            pulseReport(resolvedId);
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            if (!data || typeof data !== 'object') return;
            const resolvedId = data?.id ?? data?._id;
            if (!resolvedId) return;
            const normalized = {
                ...data,
                _id: resolvedId,
                status: 'resolved',
            };
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
            pulseReport(resolvedId);
        });
        const unsub4 = subscribe('reportDeleted', (data) => {
            if (!data || typeof data !== 'object') return;
            const deletedId = data?.id ?? data?._id;
            if (!deletedId) return;
            removeAndCache(deletedId);
            removeLoadedReporterOverviewReport(deletedId);
        });
        const unsub8 = subscribe('reportTransferred', (data) => {
            if (!data || typeof data !== 'object') return;
            const normalized = normalizeIncomingReport({
                ...data,
                status: 'transferred',
                municipalityName: data?.toMunicipality || data?.municipalityName,
                transferHistory: [
                    ...(Array.isArray(data?.transferHistory) ? data.transferHistory : []),
                    ...(data?.fromMunicipality ? [{
                        fromMunicipalityName: data?.fromMunicipality,
                        toMunicipalityName: data?.toMunicipality || data?.municipalityName,
                    }] : []),
                ],
            });
            if (!normalized) return;
            upsertAndCache(normalized);
            updateLoadedReporterOverviewReport(normalized);
            pulseReport(normalized?._id);
        });
        const unsub9 = subscribe('reportRejectedUpdate', (data) => {
            if (!data || typeof data !== 'object') return;
            const rejectedId = data?.id ?? data?._id;
            if (!rejectedId) return;
            patchStatusAndCache(rejectedId, 'rejected');
            updateLoadedReporterOverviewReport({ ...data, _id: rejectedId, status: 'rejected' });
        });

        // Reporter-scoped rejection (delivered to the reporter's user room).
        // Mirrors the rejection into the loaded reporter overview; operational
        // viewers receive the equivalent reportRejectedUpdate above.
        // Pending pins are member-visible now, so a global id-only rejection
        // must also drop the pin from the shared map list.
        const unsubReporterRejected = subscribe('reportRejected', (data) => {
            if (!data || typeof data !== 'object') return;
            const rejectedId = data?.id ?? data?._id;
            if (!rejectedId) return;
            patchStatusAndCache(rejectedId, 'rejected');
            updateLoadedReporterOverviewReport({ ...data, _id: rejectedId, status: 'rejected' });
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
            pulseTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
            pulseTimeoutsRef.current.clear();
        };
    }, [applyIslandScopeUpdate, dashboardCacheKey, removeLoadedReporterOverviewReport, subscribe, updateLoadedReporterOverviewReport]);

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

    const chartData = useMemo(() => buildPeriodIncidentTrend({
        reports: periodReports,
        scope: analyticsScope,
        selectedMonth,
        selectedYear,
    }), [periodReports, analyticsScope, selectedMonth, selectedYear]);

    // Status breakdown
    const statusData = useMemo(() => {
        const counts = { pending: 0, verified: 0, transferred: 0, responding: 0, resolved: 0, rejected: 0 };
        periodReports.forEach(r => { if (counts[r?.status] !== undefined) counts[r.status]++; });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                value,
                color: MAP_STATUS_CONFIG[name].markerColor,
            }));
    }, [periodReports]);



    // Municipality breakdown for bar chart (event-based: where it happened,
    // not which office currently handles it)
    const municipalityBarData = useMemo(() => {
        const counts = {};
        periodReports.forEach(r => {
            const name = getPhysicalMunicipality(r) || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [periodReports]);

    // Barangay breakdown for bar chart
    const barangayBarData = useMemo(() => {
        const counts = {};
        periodReports.forEach(r => {
            if (r?.barangay) {
                const physicalMunicipality = getPhysicalMunicipality(r);
                const name = activeMunicipality
                    ? r.barangay
                    : `${r.barangay}${physicalMunicipality ? ` (${physicalMunicipality})` : ''}`;
                counts[name] = (counts[name] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [periodReports, activeMunicipality]);

    const incidentTypeBarData = useMemo(() => {
        const counts = {};
        periodReports.forEach((report) => {
            const rawType = String(report?.incidentType || report?.incidentCategory || 'Unspecified');
            const name = rawType
                .replace(/[_-]+/g, ' ')
                .replace(/\b\w/g, (character) => character.toUpperCase());
            counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [periodReports]);

    // Response performance metrics
    const performanceMetrics = useMemo(() => {
        const responseMinutes = periodReports
            .filter(r => r?.respondedAt && r?.createdAt)
            .map(r => differenceInMinutes(new Date(r.respondedAt), new Date(r.createdAt)))
            .filter(minutes => Number.isFinite(minutes) && minutes >= 0)
            .sort((a, b) => a - b);
        const resolvedReports = periodReports.filter(r => r?.status === 'resolved');
        const respondingReports = periodReports.filter(r => r?.status === 'responding');
        const pendingCount = periodReports.filter(r => r?.status === 'pending').length;
        const dispatchReadyCount = periodReports.filter(r => (
            ['verified', 'transferred'].includes(r?.status) && !isReportAssigned(r)
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
        const totalActionable = periodReports.filter(r => ['verified', 'transferred', 'responding', 'resolved'].includes(r?.status)).length;
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
    }, [isReportAssigned, periodReports]);


    const showMapWorkspace = dashboardView === DASHBOARD_MAP_VIEW;

    // The switch is one node owned by this page and handed to whichever
    // workspace is rendering, which places it in the page header row. It used to
    // be rendered here in a row of its own above the workspace: a 40px control
    // alone in that band left a dead gap between the app bar and the page title
    // on the one page that has both views.
    //
    // The cost is that the header row, and with it the switch, is not mounted
    // while a lazy chunk is loading — the fallback below is the whole screen.
    // That only happens on a cold load of that workspace: once the chunk has
    // loaded, Suspense resolves without ever showing the fallback.
    const viewSwitch = canOpenAnalytics
        ? <DashboardViewSwitch active={dashboardView} />
        : null;

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
                    reports={mapScopedReports}
                    resolvedTodayReports={computedResolvedTodayReports}
                    mapScope={activeMapScope}
                    onMapScopeChange={setMapScope}
                    mapScopeLoading={islandScopeLoading}
                    mapScopeError={islandScopeError}
                    onRetryMapScope={() => loadIslandScopeReports({ force: true })}
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
                    focusedReportMissing={Boolean(focusedMapReportId && !focusedMapReport && focusedReportMissing)}
                    responderMapFilter={responderMapFilter}
                    setResponderMapFilter={setResponderMapFilter}
                    canCurrentResponderResolve={canCurrentResponderResolve}
                    handleMapRespond={handleMapRespond}
                    handleMapAcknowledgeTransfer={handleMapAcknowledgeTransfer}
                    handleMapResolve={handleMapResolve}
                    handleMapVerify={handleMapVerify}
                    handleMapReject={handleMapReject}
                    setSearchParams={setSearchParams}
                    mapSummaryPanel={mapSummaryPanel}
                    setMapSummaryPanel={setMapSummaryPanel}
                    activePanel={panelView}
                    pulseReportIds={pulseReportIds}
                    onClearFocusedEntity={clearFocusedEntity}
                    viewSwitch={viewSwitch}
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
                analyticsScope={analyticsScope}
                setAnalyticsScope={setAnalyticsScope}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                reports={periodReports}
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
                onOpenMap={() => setSearchParams({ view: DASHBOARD_MAP_VIEW })}
                onOpenReports={() => navigate('/admin/reports')}
                viewSwitch={viewSwitch}
            />
        </Suspense>
    );
};

export default DashboardPage;
