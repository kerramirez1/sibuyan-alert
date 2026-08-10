import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from '../router';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, adminAPI, analyticsAPI } from '../services/api';
import useGlobalHighRiskZones from '../hooks/useGlobalHighRiskZones';
import DashboardMapWorkspace from '../components/dashboard/DashboardMapWorkspace';
import DashboardAnalyticsWorkspace from '../components/dashboard/DashboardAnalyticsWorkspace';
import {
    deduplicateDashboardReports,
    fetchAllAdminReportPages,
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
import { parseISO, differenceInMinutes, isSameMonth } from 'date-fns';

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
    const { subscribe } = useSocket();
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

    useEffect(() => {
        const ownerId = isReporter ? String(user?._id || user?.id || '') : '';
        if (reporterOverviewOwnerRef.current === ownerId) return;

        reporterOverviewOwnerRef.current = ownerId;
        reporterOverviewRequestRef.current = null;
        reporterOverviewReportsRef.current = null;
        setReporterOverviewReports(null);
        setReporterOverviewReportsLoading(false);
        setReporterOverviewReportsError('');
    }, [isReporter, user?._id, user?.id]);

    const loadReporterOverviewReports = useCallback(({ force = false } = {}) => {
        if (!isReporter) return Promise.resolve([]);
        if (!force && Array.isArray(reporterOverviewReportsRef.current)) {
            return Promise.resolve(reporterOverviewReportsRef.current);
        }
        if (reporterOverviewRequestRef.current) return reporterOverviewRequestRef.current;

        const requestOwnerId = String(user?._id || user?.id || '');
        setReporterOverviewReportsLoading(true);
        setReporterOverviewReportsError('');

        const request = reportsAPI.getMyReports()
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
            return updated;
        });
    }, []);

    const removeLoadedReporterOverviewReport = useCallback((reportId) => {
        setReporterOverviewReports((current) => {
            if (!Array.isArray(current)) return current;
            const updated = removeDashboardReport(current, reportId);
            reporterOverviewReportsRef.current = updated;
            return updated;
        });
    }, []);

    const dashboardReports = useMemo(() => {
        if (!activeMunicipality) return reports;
        return reports.filter((r) => r.municipalityName === activeMunicipality);
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

            const refreshedReports = await fetchAllAdminReportPages(adminAPI.getReports);
            setReports(refreshedReports);
            navigate(`/admin/reports?view=active-responses&report=${encodeURIComponent(report._id)}`);

            return { ok: true, message: response.data?.message || 'Now responding to incident' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to respond to incident' };
        }
    }, [isResponder, navigate, user]);

    const handleMapResolve = useCallback(async (report) => {
        if (!isResponder || !report?._id) {
            return { ok: false, message: 'Responder action only' };
        }

        navigate(`/admin/reports?view=active-responses&report=${encodeURIComponent(report._id)}`);
        return { ok: true, message: 'Review the incident details before confirming resolution.' };
    }, [isResponder, navigate]);

    // Reporters use the shared map workspace without responder-only controls.

    useEffect(() => {
        setDashboardError('');
        const handleReportLoadError = (error) => {
            console.error(error);
            setDashboardError('Some dashboard data could not be loaded. Please refresh and try again.');
        };

        if (canViewReports) {
            setLoading(true);
            if (isAdmin) {
                fetchAllAdminReportPages(adminAPI.getReports)
                    .then(setReports)
                    .catch(handleReportLoadError)
                    .finally(() => setLoading(false));
            } else if (isResponder) {
                fetchAllAdminReportPages(adminAPI.getReports)
                    .then(setReports)
                    .catch(handleReportLoadError)
                    .finally(() => setLoading(false));
            } else {
                // Fallback fetch
                reportsAPI.getAll({ limit: 200, status: 'all' })
                    .then(res => {
                        setReports(deduplicateDashboardReports(res.data.data.reports || []));
                    })
                    .catch(handleReportLoadError)
                    .finally(() => setLoading(false));
            }

            // Responder dashboard cards rely on roleStats; fetch it in this branch too.
            if (isResponder) {
                analyticsAPI.getResponder()
                    .then(res => setRoleStats(res.data.data))
                    .catch(err => console.error(err));
            }
        } else if (isAuthenticated && (isReporter || isResponder)) {
            // Reporters & responders: fetch verified reports for the map display
            setLoading(true);
            reportsAPI.getAll({ limit: 200, status: 'all' })
                .then(res => {
                    setReports(deduplicateDashboardReports(res.data.data.reports || []));
                })
                .catch(handleReportLoadError)
                .finally(() => setLoading(false));

            // Fetch role-specific analytics
            if (isResponder) {
                analyticsAPI.getResponder().then(res => setRoleStats(res.data.data)).catch(console.error);
            } else if (isReporter) {
                analyticsAPI.getReporter().then(res => setRoleStats(res.data.data)).catch(console.error);
            }
        } else {
            // Public/ordinary users: fetch public map data
            setLoading(true);
            reportsAPI.getAll({ limit: 200, status: 'all' })
                .then(res => {
                    setReports(deduplicateDashboardReports(res.data.data.reports || []));
                })
                .catch(handleReportLoadError)
                .finally(() => setLoading(false));

        }

    }, [canViewReports, isReporter, isResponder, activeMunicipality, isAdmin]);

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
        const normalizeIncomingReport = (report) => {
            if (!report) return null;
            const id = report._id || report.id;
            if (!id) return null;

            const now = new Date().toISOString();
            return {
                ...report,
                _id: id,
                incidentCategory: report.incidentCategory || report.category,
                incidentType: report.incidentType || report.type,
                municipalityName: report.municipalityName || report.municipality,
                createdAt: report.createdAt || report.timestamp || report.incidentTime || now,
                incidentTime: report.incidentTime || report.createdAt || report.timestamp || now,
            };
        };

        const unsub0 = subscribe('newReport', (data) => {
            const normalized = normalizeIncomingReport(data);
            if (!normalized) return;
            setReports((previous) => upsertDashboardReport(previous, normalized));
        });

        const unsub1 = subscribe('reportVerified', (report) => {
            const normalized = normalizeIncomingReport({ ...report, status: 'verified' });
            if (!normalized) return;
            setReports((previous) => upsertDashboardReport(previous, normalized));
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub2 = subscribe('reportResponded', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'responding',
            };
            setReports((previous) => upsertDashboardReport(previous, normalized));
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub3 = subscribe('reportResolved', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'resolved',
            };
            setReports((previous) => upsertDashboardReport(previous, normalized));
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsubResolutionDetails = subscribe('reportResolutionDetails', (data) => {
            const normalized = {
                ...data,
                _id: data.id,
                status: 'resolved',
            };
            setReports((previous) => upsertDashboardReport(previous, normalized));
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub4 = subscribe('reportDeleted', (data) => {
            setReports((previous) => removeDashboardReport(previous, data?.id ?? data?._id));
            removeLoadedReporterOverviewReport(data?.id ?? data?._id);
        });
        const unsub8 = subscribe('reportTransferred', (data) => {
            const normalized = normalizeIncomingReport({
                ...data,
                status: 'transferred',
                municipalityName: data.toMunicipality || data.municipalityName,
            });
            if (!normalized) return;
            setReports((previous) => upsertDashboardReport(previous, normalized));
            updateLoadedReporterOverviewReport(normalized);
        });
        const unsub9 = subscribe('reportRejectedUpdate', (data) => {
            if (!data?.id) return;
            setReports((previous) => updateDashboardReportStatus(previous, data.id, 'rejected'));
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
        };
    }, [removeLoadedReporterOverviewReport, subscribe, updateLoadedReporterOverviewReport]);

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
        );
    }


    return (
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
    );
};

export default DashboardPage;
