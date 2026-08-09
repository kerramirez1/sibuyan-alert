export const MAP_REPORT_STATUSES = Object.freeze(['verified', 'transferred', 'responding']);

const MAP_REPORT_STATUS_SET = new Set(MAP_REPORT_STATUSES);

export const getMapReportId = (report) => {
    const id = report?._id ?? report?.id;
    return id === null || id === undefined ? null : String(id);
};

export const getMapCoordinates = (report) => {
    const rawLat = report?.coordinates?.lat ?? report?.location?.coordinates?.[1] ?? report?.lat;
    const rawLng = report?.coordinates?.lng ?? report?.location?.coordinates?.[0] ?? report?.lng;
    if (rawLat === null || rawLat === undefined || rawLat === '') return null;
    if (rawLng === null || rawLng === undefined || rawLng === '') return null;

    const lat = Number(rawLat);
    const lng = Number(rawLng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
};

export const getVisibleMapReports = (reports = [], { includePending = false } = {}) => {
    const allowedStatuses = includePending
        ? new Set(['pending', ...MAP_REPORT_STATUSES])
        : MAP_REPORT_STATUS_SET;
    const reportsById = new Map();
    const reportsWithoutId = [];

    reports.forEach((report) => {
        if (!allowedStatuses.has(report?.status) || !getMapCoordinates(report)) return;

        const id = getMapReportId(report);
        if (!id) {
            reportsWithoutId.push(report);
            return;
        }

        // Keep the latest representation of one report identity without inflating map metrics.
        reportsById.set(id, report);
    });

    return [...reportsById.values(), ...reportsWithoutId];
};

const hasAssignedResponder = (report) => (
    (Array.isArray(report?.responders) && report.responders.length > 0)
    || Boolean(report?.respondedBy)
);

export const getFilteredMapReports = (reports = [], {
    includePending = false,
    category = null,
    statusFilter = null,
    filterMode = 'public',
} = {}) => {
    const visibleReports = getVisibleMapReports(reports, { includePending });
    const categoryFilteredReports = category
        ? visibleReports.filter((report) => report.incidentCategory === category)
        : visibleReports;

    if (statusFilter === 'pending') {
        if (filterMode === 'review') {
            return categoryFilteredReports.filter((report) => report.status === 'pending');
        }

        return categoryFilteredReports.filter((report) => (
            report.status === 'transferred'
            || (['pending', 'verified'].includes(report.status) && !hasAssignedResponder(report))
        ));
    }

    if (statusFilter === 'responding') {
        return categoryFilteredReports.filter((report) => (
            report.status === 'responding'
            || (filterMode === 'response' && report.status === 'pending' && hasAssignedResponder(report))
        ));
    }

    return categoryFilteredReports;
};

export const groupReportsByMapLocation = (reports = [], precision = 5) => {
    const groups = new Map();

    getVisibleMapReports(reports, { includePending: true }).forEach((report) => {
        const coordinates = getMapCoordinates(report);
        const key = `${coordinates.lat.toFixed(precision)}:${coordinates.lng.toFixed(precision)}`;
        const existing = groups.get(key);

        if (existing) {
            existing.reports.push(report);
        } else {
            groups.set(key, { key, coordinates, reports: [report] });
        }
    });

    return Array.from(groups.values());
};
