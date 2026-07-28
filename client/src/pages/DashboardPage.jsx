import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { format, isSameDay, parseISO, differenceInMinutes, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';

const STATUS_COLORS = {
    pending: '#f59e0b',
    verified: '#3b82f6',
    transferred: '#7c3aed',
    responding: '#4f46e5',
    resolved: '#10b981',
    rejected: '#ef4444',
};

const DashboardPage = () => {
    const { user, isAuthenticated } = useAuth();
    const [reports, setReports] = useState([]);
    const { zones: highRiskZones } = useGlobalHighRiskZones();
    const [roleStats, setRoleStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dashboardError, setDashboardError] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const { subscribe } = useSocket();
    const [showZoneModal, setShowZoneModal] = useState(false);
    const [showIncidentModal, setShowIncidentModal] = useState(false);
    const [showMapPendingModal, setShowMapPendingModal] = useState(false);
    const [showMapRespondingModal, setShowMapRespondingModal] = useState(false);
    const [showMapResolvedModal, setShowMapResolvedModal] = useState(false);
    const [responderMapFilter, setResponderMapFilter] = useState('all');
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const historySectionRef = useRef(null);
    const isMapView = searchParams.get('view') === 'map';
    const panelView = searchParams.get('panel');

    // Memoize focusLocation from searchParams
    const focusLocation = useMemo(() => {
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');
        const zoom = searchParams.get('zoom');
        if (lat && lng) {
            return {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                zoom: parseInt(zoom) || 16
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

    const dashboardReports = useMemo(() => {
        if (!activeMunicipality) return reports;
        return reports.filter((r) => r.municipalityName === activeMunicipality);
    }, [reports, activeMunicipality]);

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
        const today = new Date().toDateString();
        return dashboardReports.filter(r => {
            if (r.status !== 'resolved') return false;
            const rDate = new Date(r.resolvedAt || r.updatedAt || r.createdAt).toDateString();
            if (rDate !== today) return false;
            if (isAdmin) return true;
            return r.resolvedBy?._id === user?._id || r.resolvedBy === user?._id;
        });
    }, [isAdmin, dashboardReports, user]);

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

            return { ok: true, message: response.data?.message || 'Now responding to incident' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to respond to incident' };
        }
    }, [isResponder, user]);

    const handleMapResolve = useCallback(async (report) => {
        if (!isResponder || !report?._id) {
            return { ok: false, message: 'Responder action only' };
        }

        try {
            const response = await adminAPI.resolveReport(report._id, { resolutionNotes: 'Resolved via map popup' });

            const refreshedReports = await fetchAllAdminReportPages(adminAPI.getReports);
            setReports(refreshedReports);

            return { ok: true, message: response.data?.message || 'Incident resolved successfully' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to resolve incident' };
        }
    }, [isResponder]);

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
        });
        const unsub2 = subscribe('reportResponded', (data) => {
            setReports((previous) => upsertDashboardReport(previous, {
                ...data,
                _id: data.id,
                status: 'responding',
            }));
        });
        const unsub3 = subscribe('reportResolved', (data) => {
            setReports((previous) => upsertDashboardReport(previous, {
                ...data,
                _id: data.id,
                status: 'resolved',
            }));
        });
        const unsub4 = subscribe('reportDeleted', (data) => {
            setReports((previous) => removeDashboardReport(previous, data?.id ?? data?._id));
        });
        const unsub8 = subscribe('reportTransferred', (data) => {
            const normalized = normalizeIncomingReport({
                ...data,
                status: 'transferred',
                municipalityName: data.toMunicipality || data.municipalityName,
            });
            if (!normalized) return;
            setReports((previous) => upsertDashboardReport(previous, normalized));
        });
        const unsub9 = subscribe('reportRejectedUpdate', (data) => {
            if (!data?.id) return;
            setReports((previous) => updateDashboardReportStatus(previous, data.id, 'rejected'));
        });

        return () => {
            unsub0();
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub8();
            unsub9();
        };
    }, [subscribe]);

    useEffect(() => {
        if (panelView === 'incidents') {
            setShowIncidentModal(true);
        }
        if (panelView === 'zones') {
            setShowZoneModal(true);
        }
        if (panelView === 'history' && historySectionRef.current) {
            historySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [panelView]);

    // ===== COMPUTED DATA =====

    const chartData = useMemo(() => {
        const data = [];
        const start = startOfMonth(selectedMonth);
        const end = isSameMonth(selectedMonth, new Date()) ? new Date() : endOfMonth(selectedMonth);
        const interval = eachDayOfInterval({ start, end });

        interval.forEach(date => {
            const dayReports = monthFilteredReports.filter(r => isSameDay(parseISO(r.createdAt), date));
            data.push({
                date: format(date, 'd'),
                fullDate: format(date, 'MMM d, yyyy'),
                accidents: dayReports.filter(r => r.incidentCategory === 'accident').length,
                total: dayReports.length,
            });
        });
        return data;
    }, [monthFilteredReports, selectedMonth]);

    // Status breakdown
    const statusData = useMemo(() => {
        const counts = { pending: 0, verified: 0, transferred: 0, responding: 0, resolved: 0, rejected: 0 };
        monthFilteredReports.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: STATUS_COLORS[name] }));
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
                roleStats={roleStats}
                focusLocation={focusLocation}
                responderMapFilter={responderMapFilter}
                setResponderMapFilter={setResponderMapFilter}
                canCurrentResponderResolve={canCurrentResponderResolve}
                handleMapRespond={handleMapRespond}
                handleMapResolve={handleMapResolve}
                setSearchParams={setSearchParams}
                showZoneModal={showZoneModal}
                setShowZoneModal={setShowZoneModal}
                showIncidentModal={showIncidentModal}
                setShowIncidentModal={setShowIncidentModal}
                showMapPendingModal={showMapPendingModal}
                setShowMapPendingModal={setShowMapPendingModal}
                showMapRespondingModal={showMapRespondingModal}
                setShowMapRespondingModal={setShowMapRespondingModal}
                showMapResolvedModal={showMapResolvedModal}
                setShowMapResolvedModal={setShowMapResolvedModal}
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
