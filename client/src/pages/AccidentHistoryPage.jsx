import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isAfter, subDays } from 'date-fns';
import toast from '../utils/appToast';
import { resolveAssetUrl } from '../utils/assets';
import {
    HiOutlineArchive,
    HiOutlineBadgeCheck,
    HiOutlineCalendar,
    HiOutlineChevronDown,
    HiOutlineClock,
    HiOutlineEye,
    HiOutlineLocationMarker,
    HiOutlineLockClosed,
    HiOutlineMap,
    HiOutlinePhotograph,
    HiOutlineSearch,
    HiOutlineShieldCheck,
    HiOutlineUserGroup,
    HiOutlineX,
} from 'react-icons/hi';
import { adminAPI, reportsAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import ImageViewer from '../components/ui/ImageViewer';
import { useSearchParams } from '../router';
import { isSameManilaCalendarDay } from '../utils/reportResolution';

const SEVERITY_CONFIG = {
    minor: { label: 'Minor', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    moderate: { label: 'Moderate', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    severe: { label: 'Severe', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
    critical: { label: 'Critical', dot: 'bg-red-700', badge: 'bg-red-100 text-red-800 border-red-300' },
};

const INCIDENT_TYPE_LABELS = {
    vehicular: 'Vehicular Collision',
    motorcycle: 'Motorcycle Accident',
    pedestrian: 'Hit & Run / Pedestrian',
    bicycle: 'Bicycle Accident',
    self_accident: 'Self Accident',
    mechanical: 'Mechanical Failure',
    other: 'Other Incident',
};

const normalizeDateFilter = (value) => (
    ['today', '7', '30'].includes(value) ? value : 'all'
);

const formatDate = (value, pattern = 'MMM d, yyyy') => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : format(date, pattern);
};

const formatRelativeDate = (value) => {
    if (!value) return 'Unknown date';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Unknown date'
        : formatDistanceToNow(date, { addSuffix: true });
};

const getCoordinates = (report) => {
    const lat = Number(report?.coordinates?.lat);
    const lng = Number(report?.coordinates?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        : 'Not available';
};

const AccidentHistoryPage = () => {
    const { user, isAuthenticated } = useAuth();
    const { subscribe } = useSocket();
    const [searchParams] = useSearchParams();
    const requestedDateFilter = searchParams.get('date');
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState(() => normalizeDateFilter(requestedDateFilter));
    const [severityFilter, setSeverityFilter] = useState('all');
    const [municipalityFilter, setMunicipalityFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImage, setViewerImage] = useState(null);

    const canViewFullDetails = useMemo(() => (
        Boolean(isAuthenticated && user && ['municipal_admin', 'responder'].includes(user.role))
    ), [isAuthenticated, user]);

    const fetchReports = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const response = canViewFullDetails
                ? await adminAPI.getReports({ limit: 500, status: 'resolved' })
                : await reportsAPI.getAll({ limit: 500, status: 'resolved' });
            const rows = response.data?.data?.reports || [];
            setReports(rows.filter((report) => report.status === 'resolved'));
        } catch (error) {
            console.error('Failed to fetch accident history:', error);
            if (!silent) toast.error('Failed to load accident history');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [canViewFullDetails]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    useEffect(() => {
        setDateFilter(normalizeDateFilter(requestedDateFilter));
    }, [requestedDateFilter]);

    useEffect(() => {
        const unsubscribeResolved = subscribe('reportResolved', () => fetchReports(true));
        const unsubscribeDeleted = subscribe('reportDeleted', (data) => {
            if (!data?.id) return;
            setReports((current) => current.filter((report) => report._id !== data.id));
        });
        return () => {
            unsubscribeResolved();
            unsubscribeDeleted();
        };
    }, [subscribe, fetchReports]);

    const municipalities = useMemo(() => (
        [...new Set(reports.map((report) => report.municipalityName).filter(Boolean))].sort()
    ), [reports]);

    const filteredReports = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const cutoff = ['7', '30'].includes(dateFilter)
            ? subDays(new Date(), Number(dateFilter))
            : null;

        return reports
            .filter((report) => {
                if (query) {
                    const searchable = [
                        report.address,
                        report.barangay,
                        report.municipalityName,
                        report.incidentType,
                        report.description,
                    ].filter(Boolean).join(' ').toLowerCase();
                    if (!searchable.includes(query)) return false;
                }
                const resolvedDate = report.resolvedAt || report.createdAt;
                if (dateFilter === 'today' && !isSameManilaCalendarDay(resolvedDate)) return false;
                if (cutoff && !isAfter(new Date(resolvedDate), cutoff)) return false;
                if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
                if (municipalityFilter !== 'all' && report.municipalityName !== municipalityFilter) return false;
                return true;
            })
            .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt));
    }, [reports, searchQuery, dateFilter, severityFilter, municipalityFilter]);

    const stats = useMemo(() => {
        const now = new Date();
        const municipalityCounts = reports.reduce((counts, report) => {
            const name = report.municipalityName || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
            return counts;
        }, {});
        const topMunicipality = Object.entries(municipalityCounts).sort((a, b) => b[1] - a[1])[0];

        return {
            total: reports.length,
            last7: reports.filter((report) => isAfter(new Date(report.resolvedAt || report.createdAt), subDays(now, 7))).length,
            last30: reports.filter((report) => isAfter(new Date(report.resolvedAt || report.createdAt), subDays(now, 30))).length,
            topArea: topMunicipality?.[0] || 'No data',
            topAreaCount: topMunicipality?.[1] || 0,
        };
    }, [reports]);

    const hasFilters = Boolean(
        searchQuery || dateFilter !== 'all' || severityFilter !== 'all' || municipalityFilter !== 'all'
    );

    const clearFilters = () => {
        setSearchQuery('');
        setDateFilter('all');
        setSeverityFilter('all');
        setMunicipalityFilter('all');
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto space-y-5 animate-pulse">
                <div className="h-16 rounded-xl bg-gray-100" />
                <div className="grid grid-cols-2 md:grid-cols-4 rounded-xl border border-gray-100 bg-white">
                    {[0, 1, 2, 3].map((item) => (
                        <div key={item} className={`p-4 sm:p-6 border-gray-100 ${item % 2 === 1 ? 'border-l' : ''
                            } ${item >= 2 ? 'border-t' : ''
                            } md:border-t-0 ${item > 0 ? 'md:border-l' : ''
                            }`}>
                            <div className="h-3 w-20 bg-gray-100 rounded" />
                            <div className="mt-3 h-6 w-12 bg-gray-200 rounded" />
                            <div className="mt-2 h-2.5 w-24 bg-gray-100 rounded" />
                        </div>
                    ))}
                </div>
                <div className="h-48 rounded-xl bg-gray-100" />
            </div>
        );
    }

    const metricCards = [
        { label: 'Total resolved', value: stats.total, helper: 'All recorded incidents', icon: HiOutlineBadgeCheck },
        { label: 'Last 7 days', value: stats.last7, helper: 'Recently closed', icon: HiOutlineClock },
        { label: 'Last 30 days', value: stats.last30, helper: 'Monthly activity', icon: HiOutlineCalendar },
        { label: 'Most incidents', value: stats.topArea, helper: `${stats.topAreaCount} resolved`, icon: HiOutlineLocationMarker, text: true },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gray-900 text-white flex items-center justify-center shrink-0">
                        <HiOutlineArchive className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Records</p>
                        <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900">Accident history</h1>
                        <p className="mt-1 text-sm text-gray-500">Resolved road incidents across Sibuyan Island.</p>
                    </div>
                </div>

                <div className={`inline-flex self-start items-center gap-2 rounded-sm border px-3 py-2 text-[11px] font-bold uppercase tracking-wider select-none ${canViewFullDetails
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-gray-300 bg-gray-100 text-gray-700'
                    }`} aria-label={canViewFullDetails ? 'Operational access level' : 'Public records access level'}>
                    {canViewFullDetails
                        ? <HiOutlineShieldCheck className="w-4 h-4" />
                        : <HiOutlineEye className="w-4 h-4" />}
                    {canViewFullDetails ? 'Operational access' : 'Public records'}
                </div>
            </header>

            <section className="grid grid-cols-2 gap-px border border-gray-300 bg-gray-300 md:grid-cols-4 dark:border-gray-600 dark:bg-gray-600" aria-label="History summary">
                {metricCards.map(({ label, value, helper, icon: Icon, text }) => (
                    <div
                        key={label}
                        className="bg-white p-4 sm:p-5 dark:bg-gray-900"
                    >
                        <div className="flex items-center gap-1.5">
                            <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h2>
                        </div>
                        <p className={`mt-2 font-display font-bold text-gray-900 dark:text-white ${text ? 'text-xl truncate' : 'text-3xl'}`}>{value}</p>
                        <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">{helper}</p>
                    </div>
                ))}
            </section>

            <section className="border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900" aria-label="Resolved accident records">
                {/* Filters */}
                <div className="border-b border-gray-300 bg-gray-100 p-4 dark:border-gray-600 dark:bg-gray-800">
                    <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_repeat(3,auto)]">
                        <label className="relative block">
                            <span className="sr-only">Search accident history</span>
                            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search location, barangay, or incident type"
                                className="w-full rounded-sm border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-gray-800 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-gray-700"
                            />
                        </label>

                        <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="rounded-sm border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-700 outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                            <option value="all">All dates</option>
                            <option value="today">Today</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 3 months</option>
                            <option value="365">Last year</option>
                        </select>

                        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} className="rounded-sm border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-700 outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                            <option value="all">All severities</option>
                            <option value="minor">Minor</option>
                            <option value="moderate">Moderate</option>
                            <option value="severe">Severe</option>
                            <option value="critical">Critical</option>
                        </select>

                        <select value={municipalityFilter} onChange={(event) => setMunicipalityFilter(event.target.value)} className="rounded-sm border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-700 outline-none focus:border-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                            <option value="all">All municipalities</option>
                            {municipalities.map((municipality) => (
                                <option key={municipality} value={municipality}>{municipality}</option>
                            ))}
                        </select>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-300 pt-3 dark:border-gray-700">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                            Showing <span className="text-gray-900 dark:text-white">{filteredReports.length}</span> of {reports.length} records
                        </p>
                        {hasFilters && (
                            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700 hover:text-brand-800 dark:text-brand-400">
                                <HiOutlineX className="w-3.5 h-3.5" /> Clear filters
                            </button>
                        )}
                    </div>
                </div>

                {filteredReports.length === 0 ? (
                    <div className="border-t border-gray-100 px-6 py-14 text-center">
                        <HiOutlineArchive className="mx-auto w-8 h-8 text-gray-300" />
                        <h2 className="mt-3 text-base font-semibold text-gray-900">No records found</h2>
                        <p className="mt-1 text-sm text-gray-500">Try changing or clearing the current filters.</p>
                        {hasFilters && (
                            <button type="button" onClick={clearFilters} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(150px,.8fr)_130px_110px_36px] gap-4 border-b border-gray-300 bg-gray-200 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            <span>Incident</span>
                            <span>Municipality</span>
                            <span>Resolved</span>
                            <span>Severity</span>
                            <span />
                        </div>

                        <div className="divide-y divide-gray-100">
                            {filteredReports.map((report) => {
                                const severity = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG.moderate;
                                const isExpanded = expandedId === report._id;
                                const incidentDate = report.incidentTime || report.accidentTime || report.createdAt;
                                const resolvedDate = report.resolvedAt || report.updatedAt;
                                const casualtyCount = Number(report.casualties?.injured || 0) + Number(report.casualties?.fatalities || 0);

                                return (
                                    <article key={report._id}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(isExpanded ? null : report._id)}
                                            aria-expanded={isExpanded}
                                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${INCIDENT_TYPE_LABELS[report.incidentType] || 'incident'}`}
                                            className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-gray-50 md:grid-cols-[minmax(0,1.5fr)_minmax(150px,.8fr)_130px_110px_36px] md:items-center md:gap-4 md:px-5"
                                        >
                                            <div className="flex min-w-0 items-start gap-3">
                                                <span
                                                    className={`mt-1.5 h-2.5 w-2.5 rounded-full ${severity.dot} shrink-0`}
                                                    title={`${severity.label} severity`}
                                                    aria-label={`${severity.label} severity indicator`}
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-900">
                                                        {INCIDENT_TYPE_LABELS[report.incidentType] || report.incidentType || 'Road incident'}
                                                    </p>
                                                    <p className="mt-1 truncate text-xs text-gray-500">
                                                        {[report.barangay, report.municipalityName].filter(Boolean).join(', ') || 'Location not provided'}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-gray-400 md:hidden">Incident {formatDate(incidentDate)}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-gray-600 md:block">
                                                <HiOutlineLocationMarker className="w-4 h-4 text-gray-400 md:hidden" />
                                                <span className="truncate">{report.municipalityName || 'Unknown'}</span>
                                            </div>

                                            <div className="text-xs text-gray-600">
                                                <p>{formatDate(resolvedDate)}</p>
                                                <p className="mt-0.5 text-[11px] text-gray-400">{formatRelativeDate(resolvedDate)}</p>
                                            </div>

                                            <div className="flex items-center justify-between gap-3 md:block">
                                                <span className={`inline-flex rounded-sm border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${severity.badge}`}>{severity.label}</span>
                                                {casualtyCount > 0 && <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 md:mt-1 md:block">{casualtyCount} casualties</span>}
                                            </div>

                                            <HiOutlineChevronDown className={`hidden w-4 h-4 text-gray-400 transition-transform md:block ${isExpanded ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-gray-300 bg-gray-100 px-4 py-5 md:px-8 dark:border-gray-600 dark:bg-gray-800">
                                                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.8fr)]">
                                                    <div className="space-y-5">
                                                        <div>
                                                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Incident summary</h3>
                                                            <p className="mt-2 text-sm font-medium leading-6 text-gray-800 dark:text-gray-200">{report.description || 'No incident description was provided.'}</p>
                                                        </div>

                                                        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                                                            {[
                                                                ['Incident date', formatDate(incidentDate, 'MMM d, yyyy h:mm a'), HiOutlineClock],
                                                                ['Barangay', report.barangay || 'Not available', HiOutlineLocationMarker],
                                                                ['Resolved date', formatDate(resolvedDate, 'MMM d, yyyy h:mm a'), HiOutlineBadgeCheck],
                                                                ['Municipality', report.municipalityName || 'Not available', HiOutlineMap],
                                                                ['Casualties', casualtyCount ? `${report.casualties?.injured || 0} injured, ${report.casualties?.fatalities || 0} fatal` : 'None recorded', HiOutlineUserGroup],
                                                                ...(canViewFullDetails ? [
                                                                    ['Coordinates', getCoordinates(report), HiOutlineMap],
                                                                    ['Reported by', report.reporter?.name || 'Anonymous', HiOutlineUserGroup],
                                                                    ['Views', String(report.viewCount || 0), HiOutlineEye],
                                                                ] : []),
                                                            ].map(([label, value, Icon]) => (
                                                                <div key={label}>
                                                                    <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"><Icon className="w-3.5 h-3.5" />{label}</dt>
                                                                    <dd className="mt-1 text-xs font-semibold text-gray-900 break-words dark:text-white">{value}</dd>
                                                                </div>
                                                            ))}
                                                        </dl>

                                                        {(report.respondedBy || report.resolvedBy) && (
                                                            <div className="rounded-sm border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                                                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">Handled by {report.respondedBy?.agency || report.resolvedBy?.agency || 'Emergency Services'}</p>
                                                                {canViewFullDetails && (
                                                                    <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-500">
                                                                        {report.respondedBy?.name || report.resolvedBy?.name || 'Responder'}
                                                                        {report.resolutionNotes ? ` — ${report.resolutionNotes}` : ''}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <aside className="space-y-4">
                                                        {canViewFullDetails ? (
                                                            <div className="rounded-sm border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                                                                <div className="flex items-center justify-between">
                                                                    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200"><HiOutlinePhotograph className="w-4 h-4" />Evidence</h3>
                                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{report.images?.length || 0} photos</span>
                                                                </div>
                                                                {report.images?.length ? (
                                                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                                                        {report.images.map((image, index) => (
                                                                            <button
                                                                                key={image}
                                                                                type="button"
                                                                                onClick={() => { setViewerImage(resolveAssetUrl(image)); setViewerOpen(true); }}
                                                                                className="aspect-square overflow-hidden rounded-sm border border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800"
                                                                            >
                                                                                <img src={resolveAssetUrl(image)} alt={`Evidence ${index + 1}`} className="h-full w-full object-cover transition hover:scale-105" />
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-gray-400">No evidence photos attached.</p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="rounded-sm border border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                                                                <div className="flex items-start gap-3">
                                                                    <HiOutlineLockClosed className="mt-0.5 w-4 h-4 text-gray-500 shrink-0 dark:text-gray-400" />
                                                                    <div>
                                                                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">Protected incident details</h3>
                                                                        <p className="mt-1 text-xs font-semibold leading-5 text-gray-600 dark:text-gray-400">Evidence, exact coordinates, reporter identity, and response notes are available only to authorized operational users.</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </aside>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </>
                )}
            </section>

            <ImageViewer isOpen={viewerOpen} onClose={() => setViewerOpen(false)} imageSrc={viewerImage} />
        </div>
    );
};

export default AccidentHistoryPage;
