import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Modal from '../components/ui/Modal'; // Import Modal
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { reportsAPI, adminAPI, highRiskZonesAPI, analyticsAPI } from '../services/api';
import MapView from '../components/map/MapView';
import { format, isSameDay, parseISO, differenceInMinutes, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, isSameMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import {
    HiOutlineExclamation,
    HiOutlineClock,
    HiOutlineTruck,
    HiOutlineFire,
    HiOutlineLightningBolt,
    HiOutlineDownload,
    HiOutlineShieldCheck,
    HiOutlineBadgeCheck,
    HiOutlineLocationMarker,
    HiOutlineCheckCircle,
    HiOutlineGlobe,
    HiOutlineEye,
    HiOutlineShieldExclamation,
} from 'react-icons/hi';

// Helper for Zone Types styling
const ZONE_STYLE_CONFIG = {
    accident_prone: { icon: HiOutlineExclamation, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    fire_hazard: { icon: HiOutlineFire, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    landslide_prone: { icon: HiOutlineExclamation, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    flood_prone: { icon: HiOutlineLightningBolt, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    default: { icon: HiOutlineShieldExclamation, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-100' }
};

const SEVERITY_CONFIG = {
    critical: 'bg-red-600 text-white shadow-sm ring-1 ring-red-700/50',
    high: 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-600/50',
    medium: 'bg-amber-400 text-white shadow-sm ring-1 ring-amber-500/50',
    low: 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-600/50'
};



const MUNICIPALITY_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#8b5cf6'];

const STATUS_COLORS = {
    pending: '#f59e0b',
    verified: '#22c55e',
    responding: '#3b82f6',
    resolved: '#10b981',
    rejected: '#ef4444',
};

const STANDARD_MAP_CONTAINER_CLASS = 'h-[340px] sm:h-[430px] lg:h-[520px]';

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 backdrop-blur p-3 rounded-xl shadow-xl border border-gray-100">
                <p className="text-xs font-bold text-gray-600 mb-2">{payload[0].payload.fullDate || label}</p>
                {payload.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs mb-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-gray-500 capitalize">{entry.dataKey}:</span>
                        <span className="font-bold text-gray-900">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// Custom Pie Label
const renderCustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
};

const getZoneTypeLabel = (type) => {
    switch (type) {
        case 'accident_prone': return 'Accident Prone Areas';
        case 'fire_hazard': return 'Fire Hazards';
        case 'landslide_prone': return 'Landslide Prone Areas';
        case 'flood_prone': return 'Flood Prone Areas';
        default: return 'Other Risk Zones';
    }
};

const HighRiskZonesList = ({ highRiskZones, focusMapOnLocation, setShowZoneModal }) => {
    if (!highRiskZones || highRiskZones.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200">
                    <HiOutlineShieldCheck className="w-12 h-12" />
                </div>
                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">System Secured</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">No high-risk areas detected.</p>
            </div>
        );
    }

    const groupedZones = highRiskZones.reduce((acc, zone) => {
        const t = zone.type || 'default';
        if (!acc[t]) acc[t] = [];
        acc[t].push(zone);
        return acc;
    }, {});

    return (
        <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(groupedZones).map(([type, zones]) => (
                <div key={type} className="space-y-3">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest border-b border-gray-100 pb-2 flex items-center gap-2">
                        {getZoneTypeLabel(type)}
                        <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{zones.length}</span>
                    </h3>
                    <div className="grid gap-4">
                        {zones.map((zone, idx) => {
                            const config = ZONE_STYLE_CONFIG[zone.type] || ZONE_STYLE_CONFIG.default;
                            const Icon = config.icon;
                            return (
                                <motion.div
                                    key={zone._id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="group relative flex items-start gap-4 p-5 bg-white border border-gray-100 rounded-2xl hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all duration-300"
                                >
                                    <div className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center ${config.color} shrink-0 shadow-sm group-hover:scale-110 transition-transform`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${SEVERITY_CONFIG[zone.severity] || SEVERITY_CONFIG.low}`}>
                                                {zone.severity}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                {zone.municipality}
                                            </span>
                                        </div>
                                        <h4 className="font-display font-bold text-gray-900 group-hover:text-brand-600 transition-colors break-words">
                                            {zone.name}
                                        </h4>
                                        <p className="text-gray-500 text-xs mt-1 leading-relaxed line-clamp-2">
                                            {zone.description}
                                        </p>
                                        <div className="mt-3 flex items-center gap-3">
                                            <button
                                                onClick={() => {
                                                    focusMapOnLocation(zone.coordinates, 16);
                                                    setShowZoneModal(false);
                                                }}
                                                className="group px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl text-xs font-bold hover:from-brand-600 hover:to-brand-700 transition-all duration-300 flex items-center gap-2 shadow-lg shadow-black/15 hover:shadow-brand-500/30 active:scale-95"
                                            >
                                                <HiOutlineEye className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                Explore on Map
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const DashboardPage = () => {
    const { user, isAuthenticated } = useAuth();
    const [reports, setReports] = useState([]);
    const [highRiskZones, setHighRiskZones] = useState([]);
    const [stats, setStats] = useState(null);
    const [roleStats, setRoleStats] = useState(null);
    const [, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const { subscribe } = useSocket();
    const [showAll, setShowAll] = useState(false);
    const [showZoneModal, setShowZoneModal] = useState(false);
    const [showIncidentModal, setShowIncidentModal] = useState(false);
    const [showMapPendingModal, setShowMapPendingModal] = useState(false);
    const [showMapRespondingModal, setShowMapRespondingModal] = useState(false);
    const [showMapResolvedModal, setShowMapResolvedModal] = useState(false);
    const [responderMapFilter, setResponderMapFilter] = useState('all');
    const [searchParams, setSearchParams] = useSearchParams();
    const historySectionRef = useRef(null);
    const isMapView = searchParams.get('view') === 'map';
    const panelView = searchParams.get('panel');

    const focusMapOnLocation = useCallback((coords, zoom = 16) => {
        if (!coords) return;
        const lat = Number(coords.lat);
        const lng = Number(coords.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        setSearchParams({
            view: 'map',
            lat: String(lat),
            lng: String(lng),
            zoom: String(zoom),
            focus: String(Date.now()),
        });
    }, [setSearchParams]);

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
    // Reporters only see the public map — same as unauthenticated users
    const canViewReports = isAuthenticated && user && !isReporter && user.role !== 'ordinary';
    const isAdmin = ['admin', 'municipal_admin'].includes(user?.role);
    const isResponder = user?.role === 'responder';
    const hasMunicipality = (isAdmin || isResponder) && !!user?.assignedMunicipality;
    const activeMunicipality = (hasMunicipality && !showAll) ? user.assignedMunicipality : null;

    const isReportAssigned = useCallback((report) => {
        if (!report) return false;
        const hasResponders = Array.isArray(report.responders) && report.responders.length > 0;
        return hasResponders || !!report.respondedBy;
    }, []);

    const isAwaitingResponder = useCallback((report) => {
        if (!report) return false;
        const awaitingStatuses = ['pending'];
        return awaitingStatuses.includes(report.status) && !isReportAssigned(report);
    }, [isReportAssigned]);

    const responderMapPendingCount = useMemo(
        () => reports.filter((r) => isAwaitingResponder(r)).length,
        [reports, isAwaitingResponder]
    );

    const responderPendingReports = useMemo(
        () => reports.filter((r) => isAwaitingResponder(r)),
        [reports, isAwaitingResponder]
    );

    const responderRespondingReports = useMemo(
        () => reports.filter((r) => r.status === 'responding' || (r.status === 'pending' && isReportAssigned(r))),
        [reports, isReportAssigned]
    );

    const responderMapRespondingCount = useMemo(
        () => reports.filter((r) => r.status === 'responding' || (r.status === 'pending' && isReportAssigned(r))).length,
        [reports, isReportAssigned]
    );

    const computedActiveIncidents = useMemo(() => {
        if (isAdmin) {
            return reports.filter(r => r.status === 'verified').length;
        }
        return roleStats?.activeIncidents || 0;
    }, [isAdmin, reports, roleStats]);

    const computedResolvedTodayReports = useMemo(() => {
        const today = new Date().toDateString();
        return reports.filter(r => {
            if (r.status !== 'resolved') return false;
            const rDate = new Date(r.resolvedAt || r.updatedAt || r.createdAt).toDateString();
            if (rDate !== today) return false;
            if (isAdmin) {
                if (activeMunicipality) {
                    return r.municipalityName === activeMunicipality;
                }
                return true;
            }
            return r.resolvedBy?._id === user?._id || r.resolvedBy === user?._id;
        });
    }, [isAdmin, reports, user, activeMunicipality]);

    const computedResolvedToday = useMemo(() => {
        if (isAdmin || isResponder) {
            return computedResolvedTodayReports.length;
        }
        return roleStats?.myResolvedToday || 0;
    }, [isAdmin, isResponder, computedResolvedTodayReports, roleStats]);

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

            const refreshed = await adminAPI.getReports({ limit: 1000 });
            setReports(refreshed.data.data.reports || []);

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

            const refreshed = await adminAPI.getReports({ limit: 1000 });
            setReports(refreshed.data.data.reports || []);

            return { ok: true, message: response.data?.message || 'Incident resolved successfully' };
        } catch (error) {
            return { ok: false, message: error.response?.data?.message || 'Failed to resolve incident' };
        }
    }, [isResponder]);

    // Reporters see the same map view as responders — no redirect needed

    useEffect(() => {
        if (canViewReports) {
            setLoading(true);
            if (isAdmin) {
                // Admin fetch: Pass showAll param to get consolidated data when toggled
                adminAPI.getReports({ limit: 1000, showAll: showAll })
                    .then(res => {
                        setReports(res.data.data.reports || []);
                    })
                    .catch(err => console.error(err))
                    .finally(() => setLoading(false));
            } else if (isResponder) {
                // Responder fetch: use admin endpoint so pending reports are included
                adminAPI.getReports({ limit: 1000 })
                    .then(res => {
                        setReports(res.data.data.reports || []);
                    })
                    .catch(err => console.error(err))
                    .finally(() => setLoading(false));
            } else {
                // Fallback fetch
                reportsAPI.getAll({ limit: 200, status: 'all' })
                    .then(res => {
                        setReports(res.data.data.reports || []);
                    })
                    .catch(err => console.error(err))
                    .finally(() => setLoading(false));
            }

            const statsParams = activeMunicipality ? { municipalityName: activeMunicipality } : {};
            reportsAPI.getStats(statsParams)
                .then(res => setStats(res.data.data))
                .catch(err => console.error(err));

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
                    setReports(res.data.data.reports || []);
                })
                .catch(err => console.error(err))
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
                    setReports(res.data.data.reports || []);
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false));

            reportsAPI.getStats()
                .then(res => setStats(res.data.data))
                .catch(err => console.error(err));
        }

        highRiskZonesAPI.getAll()
            .then(res => setHighRiskZones(res.data.data || []))
            .catch(err => console.error(err));
    }, [canViewReports, isReporter, isResponder, activeMunicipality, showAll]);

    useEffect(() => {
        if (!isResponder) {
            setResponderMapFilter('all');
        }
    }, [isResponder]);


    // Filter reports by municipality on the client side
    const filteredReports = useMemo(() => {
        if (!activeMunicipality) return reports;
        return reports.filter(r => r.municipalityName === activeMunicipality);
    }, [reports, activeMunicipality]);

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
        let statsDebounceTimer = null;

        const refreshStats = () => {
            const statsParams = activeMunicipality ? { municipalityName: activeMunicipality } : {};
            reportsAPI.getStats(statsParams)
                .then(res => setStats(res.data.data))
                .catch(err => console.error(err));
        };

        const scheduleStatsRefresh = () => {
            if (statsDebounceTimer) {
                clearTimeout(statsDebounceTimer);
            }
            statsDebounceTimer = setTimeout(() => {
                refreshStats();
            }, 400);
        };

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
            setReports(prev => [normalized, ...prev.filter(r => r._id !== normalized._id)]);
            scheduleStatsRefresh();
        });

        const unsub1 = subscribe('reportVerified', (report) => {
            const normalized = normalizeIncomingReport({ ...report, status: 'verified' });
            if (!normalized) return;
            setReports(prev => [normalized, ...prev.filter(r => r._id !== normalized._id)]);
            scheduleStatsRefresh();
        });
        const unsub2 = subscribe('reportResponded', (data) => {
            setReports(prev => prev.map(r => r._id === data.id
                ? { ...r, status: 'responding', respondedBy: data.respondedBy, respondedAt: data.respondedAt }
                : r
            ));
            scheduleStatsRefresh();
        });
        const unsub3 = subscribe('reportResolved', (data) => {
            setReports(prev => prev.map(r => r._id === data.id
                ? { ...r, status: 'resolved', resolvedBy: data.resolvedBy, resolvedAt: data.resolvedAt }
                : r
            ));
            scheduleStatsRefresh();
        });
        const unsub4 = subscribe('reportDeleted', (data) => {
            // Remove the deleted report from local state
            setReports(prev => prev.filter(r => r._id !== data.id));
            scheduleStatsRefresh();
        });
        const unsub5 = subscribe('highRiskZoneCreated', (zone) => {
            if (!zone?._id) return;
            setHighRiskZones(prev => [zone, ...prev.filter(z => z._id !== zone._id)]);
            scheduleStatsRefresh();
        });
        const unsub6 = subscribe('highRiskZoneUpdated', (zone) => {
            if (!zone?._id) return;
            setHighRiskZones(prev => prev.map(z => z._id === zone._id ? zone : z));
            scheduleStatsRefresh();
        });
        const unsub7 = subscribe('highRiskZoneDeleted', (data) => {
            if (!data?.id) return;
            setHighRiskZones(prev => prev.filter(z => z._id !== data.id));
            scheduleStatsRefresh();
        });

        return () => {
            if (statsDebounceTimer) {
                clearTimeout(statsDebounceTimer);
                statsDebounceTimer = null;
            }
            unsub0();
            unsub1();
            unsub2();
            unsub3();
            unsub4();
            unsub5();
            unsub6();
            unsub7();
        };
    }, [subscribe, activeMunicipality]);

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
        const counts = { pending: 0, verified: 0, responding: 0, resolved: 0, rejected: 0 };
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
                const name = `${r.barangay}${r.municipalityName ? ` (${r.municipalityName})` : ''}`;
                counts[name] = (counts[name] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [monthFilteredReports]);

    // Response performance metrics
    const performanceMetrics = useMemo(() => {
        const respondedReports = monthFilteredReports.filter(r => r.respondedAt && r.createdAt);
        const resolvedReports = monthFilteredReports.filter(r => r.status === 'resolved');
        const respondingReports = monthFilteredReports.filter(r => r.status === 'responding');

        // Avg response time (from creation to first response)
        let avgResponseMin = 0;
        if (respondedReports.length > 0) {
            const totalMin = respondedReports.reduce((sum, r) => {
                return sum + differenceInMinutes(new Date(r.respondedAt), new Date(r.createdAt));
            }, 0);
            avgResponseMin = Math.round(totalMin / respondedReports.length);
        }

        // Resolution rate
        const totalActionable = monthFilteredReports.filter(r => ['verified', 'responding', 'resolved'].includes(r.status)).length;
        const resolutionRate = totalActionable > 0 ? Math.round((resolvedReports.length / totalActionable) * 100) : 0;

        return {
            avgResponseMin,
            resolvedCount: resolvedReports.length,
            respondingCount: respondingReports.length,
            resolutionRate,
        };
    }, [monthFilteredReports]);

    // Stat cards
    const statCards = [
        {
            title: 'TOTAL ACCIDENTS',
            value: monthFilteredReports.length,
            subtitle: `For ${format(selectedMonth, 'MMMM yyyy')}`,
            icon: HiOutlineExclamation,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100',
            authOnly: true,
        },
        {
            title: 'ACTIVE RESPONSE',
            value: canViewReports ? performanceMetrics.respondingCount : '—',
            subtitle: canViewReports ? 'Currently being handled' : 'Sign in to view',
            icon: HiOutlineTruck,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            authOnly: true,
        },
        {
            title: 'RESOLVED',
            value: canViewReports ? performanceMetrics.resolvedCount : '—',
            subtitle: canViewReports ? `${performanceMetrics.resolutionRate}% resolution rate` : 'Sign in to view',
            icon: HiOutlineBadgeCheck,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            authOnly: true,
        },
        {
            title: 'HIGH RISK ZONES',
            value: highRiskZones.length,
            subtitle: 'Identified hotspots',
            icon: HiOutlineLightningBolt,
            color: 'text-red-600',
            bg: 'bg-red-50',
            border: 'border-red-100',
            authOnly: true,
        },
        {
            title: 'AVG RESPONSE TIME',
            value: canViewReports ? (performanceMetrics.avgResponseMin > 0 ? `${performanceMetrics.avgResponseMin}m` : '—') : '—',
            subtitle: canViewReports ? 'From report to response' : 'Sign in to view',
            icon: HiOutlineClock,
            color: 'text-violet-600',
            bg: 'bg-violet-50',
            border: 'border-violet-100',
            authOnly: true,
        },
    ];

    // ===========================================================================
    // PUBLIC VIEW
    // ===========================================================================
    if (!canViewReports) {
        return (
            <div className="space-y-6 sm:space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                            <span className="text-xs sm:text-sm font-bold text-emerald-600 uppercase tracking-wider">Map</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">Safety Awareness Map</h1>
                        <p className="text-gray-600 text-sm sm:text-base mt-1">View high-risk zones and accident statistics for Sibuyan Island</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
                    {statCards.filter(c => !c.authOnly).map((card, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`bg-white rounded-2xl p-5 sm:p-6 shadow-lg border-2 ${card.border} hover:shadow-xl transition-all transform hover:scale-[1.02]`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-[10px] sm:text-xs font-bold text-gray-500 tracking-wider uppercase">{card.title}</span>
                                <div className={`p-2 sm:p-2.5 rounded-xl ${card.bg} shadow-md`}>
                                    <card.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.color}`} />
                                </div>
                            </div>
                            <h3 className={`text-3xl sm:text-4xl font-bold font-display ${card.color} mb-1`}>{card.value}</h3>
                            <p className="text-[10px] sm:text-xs text-gray-500 line-clamp-1">{card.subtitle}</p>
                        </motion.div>
                    ))}
                </div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl sm:rounded-3xl p-1 sm:p-1.5 shadow-2xl border-2 border-gray-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                        <div>
                            <h3 className="font-bold text-gray-900 text-base sm:text-lg">Live Safety Map</h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">High-risk zones and verified accidents</p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setShowIncidentModal(true)}
                                className="group flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:from-indigo-600 hover:to-blue-700 transition-all duration-300 shadow-[0_4px_12px_rgba(99,102,241,0.35)] hover:shadow-[0_6px_18px_rgba(99,102,241,0.45)] hover:-translate-y-0.5 active:scale-95"
                            >
                                <HiOutlineExclamation className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span>Active Accidents</span>
                            </button>

                            <button
                                onClick={() => setShowZoneModal(true)}
                                className="group flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:from-rose-600 hover:to-red-700 transition-all duration-300 shadow-[0_4px_12px_rgba(225,29,72,0.35)] hover:shadow-[0_6px_18px_rgba(225,29,72,0.45)] hover:-translate-y-0.5 active:scale-95"
                            >
                                <HiOutlineLightningBolt className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                <span>High Risk Zones</span>
                            </button>

                            <span className="hidden sm:flex px-4 py-2 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.2em] rounded-full items-center gap-2 border border-emerald-100 shadow-sm">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                Live View
                            </span>
                        </div>
                    </div>
                    <div className={`${STANDARD_MAP_CONTAINER_CLASS} relative rounded-xl overflow-hidden m-1 sm:m-2`}>
                        <MapView reports={reports} highRiskZones={highRiskZones} enable3D={true} className="h-full w-full" focusLocation={focusLocation} />
                    </div>
                </motion.div>

                {!isAuthenticated && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                        className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border-2 border-indigo-100/50 shadow-lg">
                        <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-8">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl border-2 border-white/50 shrink-0">
                                <HiOutlineShieldCheck className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Want to help your community?</h3>
                                <p className="text-gray-700 mb-2 text-sm sm:text-base">
                                    Reporting and response tools are restricted to <strong>authorized reporters</strong> and <strong>administrators</strong>.
                                </p>
                                <p className="text-xs sm:text-sm text-gray-600">Register as a reporter to submit accident reports.</p>
                            </div>
                            <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto">
                                <Link to="/register" className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-2xl hover:shadow-blue-500/50 text-center text-sm sm:text-base transform hover:scale-[1.02] transition-all">
                                    Register as Reporter
                                </Link>
                                <Link to="/login" className="px-6 sm:px-8 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 hover:border-gray-400 shadow-lg text-center text-xs sm:text-sm transform hover:scale-[1.02] transition-all">
                                    Already have an account? Sign In
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* High Risk Zones Modal */}
                <Modal
                    isOpen={showZoneModal}
                    onClose={() => setShowZoneModal(false)}
                    title="Active Risk Monitoring"
                >
                    <HighRiskZonesList highRiskZones={highRiskZones} focusMapOnLocation={focusMapOnLocation} setShowZoneModal={setShowZoneModal} />
                </Modal>

                {/* Verified Incidents Modal */}
                <Modal
                    isOpen={showIncidentModal}
                    onClose={() => setShowIncidentModal(false)}
                    title="Verified Incidents"
                >
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {reports.filter(r => r.status === 'verified').length > 0 ? (
                            <div className="grid gap-3">
                                {reports.filter(r => r.status === 'verified').map((report, idx) => {
                                    return (
                                        <motion.div
                                            key={report._id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl ${report.incidentCategory === 'fire' ? 'bg-orange-50 text-orange-600' :
                                                    report.incidentCategory === 'accident' ? 'bg-red-50 text-red-600' :
                                                        'bg-blue-50 text-blue-600'
                                                    } flex items-center justify-center shrink-0 shadow-inner group-hover:rotate-6 transition-transform`}>
                                                    {report.incidentCategory === 'fire' ? <HiOutlineFire className="w-6 h-6" /> : <HiOutlineExclamation className="w-6 h-6" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight text-sm">
                                                            {report.incidentType}
                                                        </h4>
                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${report.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                            report.status === 'verified' ? 'bg-brand-100 text-brand-700' :
                                                                'bg-blue-100 text-blue-700'
                                                            }`}>
                                                            {report.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <span>{report.municipalityName}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                        <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const coords = report.coordinates || (report.location?.coordinates ? { lat: report.location.coordinates[1], lng: report.location.coordinates[0] } : null);
                                                    if (coords) {
                                                        setSearchParams({
                                                            view: 'map',
                                                            lat: coords.lat,
                                                            lng: coords.lng,
                                                            zoom: 17
                                                        });
                                                        setShowIncidentModal(false);
                                                    }
                                                }}
                                                className="w-full sm:w-auto px-5 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-xl text-xs font-black hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                                            >
                                                <HiOutlineLocationMarker className="w-4 h-4" />
                                                Locate
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200">
                                    <HiOutlineShieldCheck className="w-12 h-12" />
                                </div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2 tracking-tight">Status Clear</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">No active accidents reported in the monitored areas.</p>
                            </div>
                        )}
                    </div>
                </Modal>
            </div>
        );
    }

    // ===========================================================================
    // MAP CENTRIC VIEW — Full Map (No Analytics Overview)
    // Only shown when ?view=map is present
    // ===========================================================================
    if (isMapView && !isResponder && !isAdmin) { // isReporter is also excluded from this specific view
        return (
            <div className="flex flex-col space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                            <span className="text-xs sm:text-sm font-bold text-emerald-600 uppercase tracking-widest">{isAdmin ? 'Admin View' : isResponder ? 'Responder View' : 'Map'}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent tracking-tight">Safety Awareness Map</h1>
                        <p className="text-gray-600 text-sm sm:text-base mt-1">Real-time accident tracking & high risk zone monitoring</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <button
                            onClick={() => setShowIncidentModal(true)}
                            className="group flex-1 sm:flex-none px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 hover:from-indigo-600 hover:to-blue-700 transition-all duration-300 shadow-[0_4px_14px_rgba(99,102,241,0.4)] hover:shadow-[0_8px_20px_rgba(99,102,241,0.5)] hover:-translate-y-0.5 active:scale-95"
                        >
                            <HiOutlineExclamation className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span>Active Accidents</span>
                        </button>
                        <button
                            onClick={() => setShowZoneModal(true)}
                            className="group flex-1 sm:flex-none px-5 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-rose-500 to-red-600 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2.5 hover:from-rose-600 hover:to-red-700 transition-all duration-300 shadow-[0_4px_14px_rgba(225,29,72,0.4)] hover:shadow-[0_8px_20px_rgba(225,29,72,0.5)] hover:-translate-y-0.5 active:scale-95"
                        >
                            <HiOutlineLightningBolt className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            <span>High Risk Zones</span>
                        </button>
                    </div>
                </div>

                {/* Full Map Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1 bg-white rounded-2xl sm:rounded-3xl p-1 sm:p-1.5 shadow-2xl border-2 border-gray-200 flex flex-col overflow-hidden relative"
                >
                    <div className={`${STANDARD_MAP_CONTAINER_CLASS} relative rounded-xl sm:rounded-[1.8rem] overflow-hidden m-1 sm:m-2`}>
                        <MapView
                            reports={reports}
                            highRiskZones={highRiskZones}
                            enable3D={true}
                            className="h-full w-full"
                            focusLocation={focusLocation}
                            showPending={isAdmin || isResponder}
                            filterStatus={isResponder ? responderMapFilter : null}
                            canRespond={isResponder}
                            onRespondToReport={handleMapRespond}
                            canResolve={isResponder}
                            onResolveReport={handleMapResolve}
                        />

                        {/* Map Overlay Indicator */}
                        <div className="hidden sm:block absolute top-6 left-6 z-10">
                            <div className="bg-white/95 backdrop-blur-lg px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl shadow-2xl border-2 border-white/40 flex items-center gap-2 sm:gap-3">
                                <div className="relative">
                                    <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 bg-red-500 rounded-full animate-ping absolute inset-0"></div>
                                    <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 bg-red-600 rounded-full relative shadow-lg shadow-red-500/50"></div>
                                </div>
                                <span className="text-[9px] sm:text-[10px] font-black text-gray-800 uppercase tracking-tight">Active Surveillance</span>
                            </div>
                        </div>
                    </div>
                </motion.div>



                {/* High Risk Zones Modal - Professional UI Design */}
                <Modal
                    isOpen={showZoneModal}
                    onClose={() => setShowZoneModal(false)}
                    title="Active Risk Monitoring"
                >
                    <HighRiskZonesList highRiskZones={highRiskZones} focusMapOnLocation={focusMapOnLocation} setShowZoneModal={setShowZoneModal} />
                </Modal>

                {/* Verified Incidents Modal */}
                <Modal
                    isOpen={showIncidentModal}
                    onClose={() => setShowIncidentModal(false)}
                    title="Verified Incidents"
                >
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {reports.filter(r => r.status === 'verified').length > 0 ? (
                            <div className="grid gap-3">
                                {reports.filter(r => r.status === 'verified').map((report, idx) => {
                                    return (
                                        <motion.div
                                            key={report._id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl ${report.incidentCategory === 'fire' ? 'bg-orange-50 text-orange-600' :
                                                    report.incidentCategory === 'accident' ? 'bg-red-50 text-red-600' :
                                                        'bg-blue-50 text-blue-600'
                                                    } flex items-center justify-center shrink-0 shadow-inner group-hover:rotate-6 transition-transform`}>
                                                    {report.incidentCategory === 'fire' ? <HiOutlineFire className="w-6 h-6" /> : <HiOutlineExclamation className="w-6 h-6" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="font-bold text-gray-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight text-sm">
                                                            {report.incidentType}
                                                        </h4>
                                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${report.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                            report.status === 'verified' ? 'bg-brand-100 text-brand-700' :
                                                                'bg-blue-100 text-blue-700'
                                                            }`}>
                                                            {report.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <span>{report.municipalityName}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                        <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const coords = report.coordinates || (report.location?.coordinates ? { lat: report.location.coordinates[1], lng: report.location.coordinates[0] } : null);
                                                    if (coords) {
                                                        setSearchParams({
                                                            view: 'map',
                                                            lat: coords.lat,
                                                            lng: coords.lng,
                                                            zoom: 17
                                                        });
                                                        setShowIncidentModal(false);
                                                    }
                                                }}
                                                className="group w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-brand-600 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-brand-700 hover:to-emerald-700 transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.45)] hover:-translate-y-0.5 active:scale-95"
                                            >
                                                <HiOutlineLocationMarker className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                                Locate
                                            </button>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200">
                                    <HiOutlineShieldCheck className="w-12 h-12" />
                                </div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2 tracking-tight">Status Clear</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">No active accidents reported in the monitored areas.</p>
                            </div>
                        )}
                    </div>
                </Modal>
            </div >
        );
    }

    // ===========================================================================
    // RESPONDER / REPORTER / ADMIN FULL-MAP VIEW — Map-only view, no analytics
    // Reporters see the same layout as responders
    // ===========================================================================
    if (isResponder || isReporter || (isAdmin && isMapView)) {
        return (
            <div className="space-y-3 sm:space-y-6">
                {/* Header Row: Title on left, buttons on right (desktop only) */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    {/* Left: label + title + subtitle */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50 shrink-0"></div>
                            <span className="text-[10px] sm:text-sm font-bold text-emerald-600 uppercase tracking-widest">
                                {(isAdmin && !isResponder) ? 'Admin View' : (isAdmin || isResponder) ? 'Responder View' : 'Map'}
                            </span>
                            {isResponder && user?.agency && (
                                <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2.5 py-0.5 rounded-full ${user.agency === 'MDRRMO' ? 'bg-red-100 text-red-700' :
                                    user.agency === 'PNP' ? 'bg-blue-100 text-blue-700' :
                                        user.agency === 'SDH' ? 'bg-purple-100 text-purple-700' :
                                            user.agency === 'BFP' ? 'bg-orange-100 text-orange-700' :
                                                'bg-gray-100 text-gray-700'
                                    }`}>
                                    {user.agency}
                                </span>
                            )}
                        </div>
                        <h1 className="text-xl sm:text-3xl lg:text-4xl font-display font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent tracking-tight">
                            Safety Awareness Map {isResponder && user?.assignedMunicipality && <span className="text-gray-400 text-base sm:text-xl font-normal">· {user.assignedMunicipality}</span>}
                        </h1>
                        <p className="text-gray-500 text-xs sm:text-base mt-0.5 sm:mt-1">Real-time incident tracking &amp; high risk zone monitoring</p>
                    </div>

                    {/* Right: buttons — hidden on mobile, shown on desktop */}
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                        {!isAdmin && (
                            <button
                                onClick={() => setShowIncidentModal(true)}
                                className="group px-6 py-3 bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:from-indigo-600 hover:to-blue-700 transition-all duration-300 shadow-[0_4px_14px_rgba(99,102,241,0.4)] active:scale-95"
                            >
                                <HiOutlineExclamation className="w-5 h-5" /> Active Incidents
                            </button>
                        )}
                    </div>
                </div>

                {/* Mobile-only: full-width buttons below title */}
                <div className="flex sm:hidden gap-2">
                    {!isAdmin && (
                        <button
                            onClick={() => setShowIncidentModal(true)}
                            className="flex-1 px-3 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_14px_rgba(99,102,241,0.4)]"
                        >
                            <HiOutlineExclamation className="w-4 h-4" /> Active Incidents
                        </button>
                    )}
                </div>

                {/* Map */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-2xl sm:rounded-3xl p-1 sm:p-1.5 shadow-2xl border-2 border-gray-200 flex flex-col overflow-hidden relative"
                >
                    <div className={`${STANDARD_MAP_CONTAINER_CLASS} relative rounded-xl overflow-hidden m-1 sm:m-2`}>
                        <MapView
                            reports={reports}
                            highRiskZones={highRiskZones}
                            enable3D={true}
                            className="h-full w-full"
                            focusLocation={focusLocation}
                            showPending={isResponder || isAdmin}
                            filterStatus={(isResponder || isAdmin) ? responderMapFilter : null}
                            canRespond={isResponder || isAdmin}
                            onRespondToReport={handleMapRespond}
                            canResolve={isResponder || isAdmin}
                            onResolveReport={handleMapResolve}
                        />
                        <div className="hidden sm:block absolute top-6 left-6 z-10">
                            <div className="bg-white/95 backdrop-blur-lg px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl shadow-2xl border-2 border-white/40 flex items-center gap-2 sm:gap-3">
                                <div className="relative">
                                    <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 bg-red-500 rounded-full animate-ping absolute inset-0"></div>
                                    <div className="w-2.5 sm:w-3 h-2.5 sm:h-3 bg-red-600 rounded-full relative shadow-lg shadow-red-500/50"></div>
                                </div>
                                <span className="text-[9px] sm:text-[10px] font-black text-gray-800 uppercase tracking-tight">
                                    {(isAdmin && !isResponder) ? 'Admin Mode' : (isResponder || isAdmin) ? 'Responder Mode' : 'Active Surveillance'}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Quick Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-2">
                    {(isResponder || isAdmin) ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowIncidentModal(true)}
                                className="text-left bg-white p-2.5 sm:p-3 rounded-xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 sm:gap-3 transform hover:scale-[1.02] cursor-pointer"
                                title="View verified incidents"
                            >
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
                                    <HiOutlineExclamation className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Verified Incidents</p>
                                    <p className="text-base sm:text-lg font-bold text-gray-900">{computedActiveIncidents}</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowMapResolvedModal(true)}
                                className="text-left bg-white p-2.5 sm:p-3 rounded-xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 sm:gap-3 transform hover:scale-[1.02] cursor-pointer"
                                title="View resolved reports for today"
                            >
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 shrink-0">
                                    <HiOutlineCheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-tight">
                                        {(isAdmin && !isResponder) ? 'Resolved Today' : 'My Resolved Today'}
                                    </p>
                                    <p className="text-base sm:text-lg font-bold text-gray-900">{computedResolvedToday}</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setResponderMapFilter('responding');
                                    setShowMapRespondingModal(true);
                                }}
                                className={`text-left bg-white p-2.5 sm:p-3 rounded-xl border-2 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 sm:gap-3 transform hover:scale-[1.02] ${responderMapFilter === 'responding' ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200'}`}
                                title="Open responding incidents"
                            >
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/30 shrink-0">
                                    <HiOutlineTruck className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Map Responding</p>
                                    <p className="text-base sm:text-lg font-bold text-gray-900">{responderMapRespondingCount}</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setResponderMapFilter('pending');
                                    setShowMapPendingModal(true);
                                }}
                                className={`text-left bg-white p-2.5 sm:p-3 rounded-xl border-2 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 sm:gap-3 transform hover:scale-[1.02] ${responderMapFilter === 'pending' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'}`}
                                title="Open pending incidents"
                            >
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-500/30 shrink-0">
                                    <HiOutlineClock className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Pending Incidents</p>
                                    <p className="text-base sm:text-lg font-bold text-gray-900">{responderMapPendingCount}</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowZoneModal(true)}
                                className="text-left bg-white p-2.5 sm:p-3 rounded-xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 sm:gap-3 transform hover:scale-[1.02] cursor-pointer"
                                title="View high risk zones"
                            >
                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-rose-500/30 shrink-0">
                                    <HiOutlineLightningBolt className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-wider leading-tight">High Risk Zones</p>
                                    <p className="text-base sm:text-lg font-bold text-gray-900">{highRiskZones.length}</p>
                                </div>
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-3 sm:gap-4 transform hover:scale-[1.02]">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
                                    <HiOutlineClock className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">My Pending</p>
                                    <p className="text-lg sm:text-xl font-bold text-gray-900">{roleStats?.myReports?.pending || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-3 sm:gap-4 transform hover:scale-[1.02]">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
                                    <HiOutlineBadgeCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">My Verified</p>
                                    <p className="text-lg sm:text-xl font-bold text-gray-900">{roleStats?.myReports?.verified || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-3 sm:gap-4 transform hover:scale-[1.02]">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                                    <HiOutlineCheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">My Resolved</p>
                                    <p className="text-lg sm:text-xl font-bold text-gray-900">{roleStats?.myReports?.resolved || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 border-gray-200 shadow-lg hover:shadow-xl transition-all flex items-center gap-3 sm:gap-4 transform hover:scale-[1.02]">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                                    <HiOutlineEye className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">Trust Points</p>
                                    <p className="text-lg sm:text-xl font-bold text-gray-900">{roleStats?.trustPoints || 0}</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Modals */}
                <Modal isOpen={showZoneModal} onClose={() => setShowZoneModal(false)} title="Active Risk Monitoring">
                    <HighRiskZonesList highRiskZones={highRiskZones} focusMapOnLocation={focusMapOnLocation} setShowZoneModal={setShowZoneModal} />
                </Modal>

                <Modal
                    isOpen={showMapPendingModal}
                    onClose={() => {
                        setShowMapPendingModal(false);
                        setResponderMapFilter('all');
                    }}
                    title="Map Pending Incidents"
                >
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {responderPendingReports.length > 0 ? (
                            <div className="grid gap-3">
                                {responderPendingReports.map((report, idx) => (
                                    <motion.div key={`pending-${report._id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
                                                <HiOutlineClock className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 uppercase tracking-tight text-sm">{report.incidentType}</h4>
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${report.status === 'verified' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>{report.status}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>{report.municipalityName}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                    <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const coords = report.coordinates || (report.location?.coordinates ? { lat: report.location.coordinates[1], lng: report.location.coordinates[0] } : null);
                                                if (coords) {
                                                    setSearchParams({ view: 'map', lat: coords.lat, lng: coords.lng, zoom: 17 });
                                                }
                                                setShowMapPendingModal(false);
                                            }}
                                            className="group w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-brand-600 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-brand-700 hover:to-emerald-700 transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.45)] hover:-translate-y-0.5 active:scale-95"
                                        >
                                            <HiOutlineLocationMarker className="w-4 h-4 group-hover:scale-110 transition-transform" /> Locate
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200"><HiOutlineShieldCheck className="w-12 h-12" /></div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No Pending Incidents</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">All map incidents are already assigned or resolved.</p>
                            </div>
                        )}
                    </div>
                </Modal>

                <Modal
                    isOpen={showMapRespondingModal}
                    onClose={() => {
                        setShowMapRespondingModal(false);
                        setResponderMapFilter('all');
                    }}
                    title="Map Responding Incidents"
                >
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {responderRespondingReports.length > 0 ? (
                            <div className="grid gap-3">
                                {responderRespondingReports.map((report, idx) => (
                                    <motion.div key={`responding-${report._id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-inner">
                                                <HiOutlineTruck className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 uppercase tracking-tight text-sm">{report.incidentType}</h4>
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                                        {report.status === 'responding' ? 'responding' : 'assigned'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>{report.municipalityName}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                    <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const coords = report.coordinates || (report.location?.coordinates ? { lat: report.location.coordinates[1], lng: report.location.coordinates[0] } : null);
                                                if (coords) {
                                                    setSearchParams({ view: 'map', lat: coords.lat, lng: coords.lng, zoom: 17 });
                                                }
                                                setShowMapRespondingModal(false);
                                            }}
                                            className="group w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-brand-600 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-brand-700 hover:to-emerald-700 transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.45)] hover:-translate-y-0.5 active:scale-95"
                                        >
                                            <HiOutlineLocationMarker className="w-4 h-4 group-hover:scale-110 transition-transform" /> Locate
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200"><HiOutlineShieldCheck className="w-12 h-12" /></div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No Active Response</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">No incidents are currently in responding state.</p>
                            </div>
                        )}
                    </div>
                </Modal>

                <Modal
                    isOpen={showMapResolvedModal}
                    onClose={() => setShowMapResolvedModal(false)}
                    title="Incidents Resolved Today"
                >
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {computedResolvedTodayReports.length > 0 ? (
                            <div className="grid gap-3">
                                {computedResolvedTodayReports.map((report, idx) => (
                                    <motion.div key={`resolved-${report._id}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 shadow-inner">
                                                <HiOutlineCheckCircle className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 uppercase tracking-tight text-sm">{report.incidentType}</h4>
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                                                        resolved
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>{report.municipalityName}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                    <span>{format(new Date(report.resolvedAt || report.updatedAt || report.createdAt), 'MMM d, h:mm a')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200"><HiOutlineShieldCheck className="w-12 h-12" /></div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">No Resolved Incidents</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">There are no reports resolved today according to your view.</p>
                            </div>
                        )}
                    </div>
                </Modal>

                <Modal isOpen={showIncidentModal} onClose={() => setShowIncidentModal(false)} title="Verified Incidents">
                    <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
                        {reports.filter(r => r.status === 'verified').length > 0 ? (
                            <div className="grid gap-3">
                                {reports.filter(r => r.status === 'verified').map((report, idx) => (
                                    <motion.div key={report._id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }}
                                        className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/50 hover:bg-white border border-gray-100 hover:border-brand-200 rounded-2xl transition-all duration-300">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl ${report.incidentCategory === 'accident' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'} flex items-center justify-center shrink-0 shadow-inner`}>
                                                <HiOutlineExclamation className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="font-bold text-gray-900 uppercase tracking-tight text-sm">{report.incidentType}</h4>
                                                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${report.status === 'pending' ? 'bg-amber-100 text-amber-700' : report.status === 'verified' ? 'bg-brand-100 text-brand-700' : 'bg-blue-100 text-blue-700'}`}>{report.status}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    <span>{report.municipalityName}</span>
                                                    <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                    <span>{format(new Date(report.createdAt), 'MMM d, h:mm a')}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => { const coords = report.coordinates || (report.location?.coordinates ? { lat: report.location.coordinates[1], lng: report.location.coordinates[0] } : null); if (coords) { setSearchParams({ view: 'map', lat: coords.lat, lng: coords.lng, zoom: 17 }); setShowIncidentModal(false); } }}
                                            className="group w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-brand-600 to-emerald-600 text-white rounded-xl text-xs font-bold hover:from-brand-700 hover:to-emerald-700 transition-all duration-300 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(22,163,74,0.3)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.45)] hover:-translate-y-0.5 active:scale-95">
                                            <HiOutlineLocationMarker className="w-4 h-4 group-hover:scale-110 transition-transform" /> Locate
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-200"><HiOutlineShieldCheck className="w-12 h-12" /></div>
                                <h3 className="text-xl font-display font-bold text-gray-900 mb-2">Status Clear</h3>
                                <p className="text-gray-500 text-sm max-w-xs mx-auto">No active accidents reported.</p>
                            </div>
                        )}
                    </div>
                </Modal>
            </div>
        );
    }

    // ===========================================================================
    // AUTHENTICATED VIEW (REPORTERS & ADMINS) — Full Analytics
    // ===========================================================================
    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
                        <span className="text-sm font-medium text-brand-600">Live Monitoring</span>
                    </div>
                    <h1 className="text-3xl font-display font-bold text-gray-900">
                        Analytics Dashboard
                        {hasMunicipality && (
                            <span className="text-gray-400 text-xl font-normal"> · {showAll ? 'All Sibuyan' : user.assignedMunicipality}</span>
                        )}
                    </h1>
                    <p className="text-gray-500">Performance metrics and accident insights</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {hasMunicipality && (
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${showAll
                                ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-[0_4px_14px_rgba(22,163,74,0.4)] hover:from-brand-700 hover:to-emerald-700 hover:shadow-[0_6px_18px_rgba(22,163,74,0.5)]'
                                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm'
                                } hover:-translate-y-0.5 active:scale-95`}
                        >
                            <HiOutlineGlobe className="w-4 h-4" />
                            {showAll ? 'Viewing: All Sibuyan' : 'View All Sibuyan'}
                        </button>
                    )}
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 gap-0.5">
                        <button
                            onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Previous month"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setSelectedMonth(new Date())}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all min-w-[110px] text-center ${isSameMonth(selectedMonth, new Date())
                                ? 'bg-brand-50 text-brand-700'
                                : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {format(selectedMonth, 'MMM yyyy')}
                            {!isSameMonth(selectedMonth, new Date()) && (
                                <span className="block text-[9px] text-gray-400 font-medium mt-0.5">Click for today</span>
                            )}
                        </button>
                        <button
                            onClick={() => {
                                const next = addMonths(selectedMonth, 1);
                                if (next <= new Date()) setSelectedMonth(next);
                            }}
                            disabled={isSameMonth(selectedMonth, new Date())}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Next month"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                    <button
                        onClick={() => {
                            // 1. Summary Data
                            const summaryData = [
                                { Metric: 'Total Accidents', Value: stats?.totalReports || 0 },
                                { Metric: 'Active Responses', Value: performanceMetrics.respondingCount },
                                { Metric: 'Resolved Cases', Value: performanceMetrics.resolvedCount },
                                { Metric: 'Resolution Rate', Value: `${performanceMetrics.resolutionRate}%` },
                                { Metric: 'Avg. Response Time (Mins)', Value: performanceMetrics.avgResponseMin },
                                { Metric: 'High Risk Zones Identified', Value: highRiskZones.length },
                                { Metric: 'Report Date', Value: format(new Date(), 'MMMM d, yyyy h:mm a') }
                            ];

                            // 2. Incident Reports Data
                            const incidentsData = reports.map(r => ({
                                'Date Reported': format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm'),
                                'Incident Title': r.title || 'Unknown',
                                'Category': r.incidentCategory || 'accident',
                                'Type': r.incidentType || 'Unknown',
                                'Status': r.status.toUpperCase(),
                                'Priority': r.priority.toUpperCase(),
                                'Municipality': r.municipalityName || 'Unknown',
                                'Barangay': r.barangay || 'Unknown',
                                'Exact Address': r.address || 'Unknown',
                                'Injuries': r.casualties?.injured || 0,
                                'Fatalities': r.casualties?.fatalities || 0,
                                'Reporter': r.reporter?.name || 'Unknown User'
                            }));

                            // 3. High Risk Zones Data
                            const zonesData = highRiskZones.map(z => ({
                                'Zone Name': z.name || 'Unnamed Zone',
                                'Type': z.type.replace('_', ' ').toUpperCase(),
                                'Municipality': z.municipalityName || 'Unknown',
                                'Address': z.address || 'Unknown',
                                'Status': z.isActive ? 'Active' : 'Inactive',
                                'Incident Count': z.stats?.incidentCount || 0,
                                'Radius (m)': z.radius || 0
                            }));

                            // Create Worksheets
                            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
                            const wsIncidents = XLSX.utils.json_to_sheet(incidentsData);
                            const wsZones = XLSX.utils.json_to_sheet(zonesData);

                            // Format Columns
                            wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
                            wsIncidents['!cols'] = [
                                { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
                                { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 10 },
                                { wch: 10 }, { wch: 20 }
                            ];
                            wsZones['!cols'] = [
                                { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 15 },
                                { wch: 15 }, { wch: 15 }
                            ];

                            // Create Workbook
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, wsSummary, "Dashboard Summary");
                            XLSX.utils.book_append_sheet(wb, wsIncidents, "Incident Reports");
                            XLSX.utils.book_append_sheet(wb, wsZones, "High Risk Zones");

                            // Generate Excel Buffer and Save
                            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                            const dataBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                            saveAs(dataBlob, `Sibuyan_Alert_Analytics_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
                        }}
                        title="Download Dashboard Data"
                        className="group p-2.5 bg-gradient-to-br from-brand-600 to-emerald-600 text-white rounded-xl hover:from-brand-700 hover:to-emerald-700 transition-all duration-300 shadow-[0_4px_14px_rgba(22,163,74,0.4)] hover:shadow-[0_6px_18px_rgba(22,163,74,0.5)] hover:-translate-y-0.5 active:scale-95"
                    >
                        <HiOutlineDownload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>

            {/* ===== STAT CARDS — 5 cards in 2 rows ===== */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {statCards.map((card, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06 }}
                        className={`bg-white rounded-2xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border ${card.border} hover:shadow-lg transition-shadow`}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className={`p-2 rounded-lg ${card.bg}`}>
                                <card.icon className={`w-4 h-4 ${card.color}`} />
                            </div>
                        </div>
                        <h3 className={`text-2xl lg:text-3xl font-bold font-display ${card.color} mb-0.5`}>
                            {card.value}
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">{card.title}</span>
                        <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">{card.subtitle}</p>
                    </motion.div>
                ))}
            </div>

            {/* ===== ROW 2: Trend Chart + Status Donut ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Incident Trend Area Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="font-bold text-gray-900">Accident Trends</h3>
                            <p className="text-xs text-gray-500">
                                {`Daily accidents for ${format(selectedMonth, 'MMMM yyyy')}`}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                                <span className="text-xs font-semibold text-gray-500">Accidents</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradAccident" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="accidents" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#gradAccident)" activeDot={{ r: 5, strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Status Breakdown Donut */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100"
                >
                    <div className="mb-4">
                        <h3 className="font-bold text-gray-900">Report Status</h3>
                        <p className="text-xs text-gray-500">Current distribution</p>
                    </div>
                    <div className="h-[180px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%" cy="50%"
                                    innerRadius={45} outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                    labelLine={false}
                                    label={renderCustomPieLabel}
                                >
                                    {statusData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                        {statusData.map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-[10px] font-semibold text-gray-500">{item.name} ({item.value})</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* ===== ROW 3: Municipality & Barangay Bar ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Municipality Bar Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100"
                >
                    <div className="mb-4">
                        <h3 className="font-bold text-gray-900">By Municipality</h3>
                        <p className="text-xs text-gray-500">Accidents per area</p>
                    </div>
                    {municipalityBarData.length > 0 ? (
                        <div className="h-[220px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={municipalityBarData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 11, fontWeight: 600 }} width={90} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                                        {municipalityBarData.map((entry, i) => (
                                            <Cell key={i} fill={MUNICIPALITY_COLORS[i % MUNICIPALITY_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No data</div>
                    )}
                </motion.div>

                {/* Barangay Bar Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.60 }}
                    className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100"
                >
                    <div className="mb-4">
                        <h3 className="font-bold text-gray-900">By Barangay</h3>
                        <p className="text-xs text-gray-500">Accidents per barangay</p>
                    </div>
                    {barangayBarData.length > 0 ? (
                        <div className="h-[220px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barangayBarData.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
                                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#374151', fontSize: 11, fontWeight: 600 }} width={120} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                                        {barangayBarData.slice(0, 8).map((entry, i) => (
                                            <Cell key={i} fill="#Ef4444" />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No data</div>
                    )}
                </motion.div>
            </div>

            {/* ===== ROW 4: Live Map (Full Width) ===== */}
            <div className="mb-6">
                <div className="bg-white rounded-2xl sm:rounded-3xl p-1 sm:p-1.5 shadow-2xl border-2 border-gray-200 overflow-hidden">
                    <div className="p-4 sm:p-5 border-b border-gray-100 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-900">Live Surveillance</h3>
                            <p className="text-xs text-gray-500">Real-time accident tracking</p>
                        </div>
                        <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-bold rounded flex items-center gap-1 animate-pulse">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-600"></div> LIVE
                        </span>
                    </div>
                    <div className={`${STANDARD_MAP_CONTAINER_CLASS} relative rounded-xl overflow-hidden m-1 sm:m-2`}>
                        <MapView reports={reports} highRiskZones={highRiskZones} showPending={isAdmin || isResponder} enable3D={true} className="h-full w-full" focusLocation={focusLocation} />
                    </div>
                </div>
            </div>

            {/* ===== ROW 5: Casualty Stats + Recent Activity ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Casualty Stats */}
                <div className="lg:col-span-1 space-y-6">
                    {/* (This matches the original structure but moved into the grid) */}
                    {/* Casualty content would go here if needed, but in current code it seems recent activity is the main column content */}
                </div>

                {/* Recent Activity (Taking up more space now?) or side-by-side */}
                <div ref={historySectionRef} className="lg:col-span-3">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.65 }}
                        className="bg-white rounded-2xl p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900">Recent Activity</h3>
                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-semibold">LAST 5</span>
                        </div>
                        <div className="space-y-4">
                            {reports.slice(0, 5).map((report) => (
                                <div key={report._id} className="flex gap-3 items-start relative pb-4 border-l-2 border-dashed border-gray-100 last:border-0 last:pb-0 ml-2 pl-5">
                                    <div className={`absolute -left-[7px] top-0 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${report.status === 'resolved' ? 'bg-emerald-500'
                                        : report.status === 'responding' ? 'bg-blue-500'
                                            : report.incidentCategory === 'accident' ? 'bg-indigo-500'
                                                : 'bg-orange-500'
                                        }`}></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                                {format(parseISO(report.createdAt), 'MMM d · HH:mm')}
                                            </span>
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${report.status === 'resolved' ? 'bg-emerald-100 text-emerald-700'
                                                : report.status === 'responding' ? 'bg-blue-100 text-blue-700'
                                                    : report.severity === 'critical' || report.severity === 'severe' ? 'bg-red-100 text-red-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {report.status === 'resolved' ? 'Resolved'
                                                    : report.status === 'responding' ? 'Responding'
                                                        : report.severity}
                                            </span>
                                        </div>
                                        <h4 className="text-xs font-bold text-gray-900 truncate">{report.address}</h4>
                                        <p className="text-[10px] text-gray-400 truncate">{report.municipalityName}</p>
                                    </div>
                                </div>
                            ))}
                            {reports.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-4">No recent activity</p>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
