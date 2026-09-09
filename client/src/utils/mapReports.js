export const MAP_REPORT_STATUSES = Object.freeze(['verified', 'transferred', 'responding', 'resolved']);

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

export const getVisibleMapReports = (reports = [], { includePending = false, includeRejected = false } = {}) => {
    const allowedStatuses = new Set([
        ...MAP_REPORT_STATUSES,
        ...(includePending ? ['pending'] : []),
        ...(includeRejected ? ['rejected'] : []),
    ]);
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

export const getFilteredMapReports = (reports = [], {
    includePending = false,
    category = null,
    statusFilter = null,
    _filterMode = 'public',
} = {}) => {
    const visibleReports = getVisibleMapReports(reports, { includePending });
    const categoryFilteredReports = category
        ? visibleReports.filter((report) => report.incidentCategory === category)
        : visibleReports;

    if (statusFilter === 'risk-zones') {
        return [];
    }

    // 'all' and 'incidents' select the same active report set; they differ
    // only in hazard-layer visibility, which isRiskZoneLayerVisibleForFilter
    // resolves at the map/legend level ('incidents' suppresses hazard zones).
    if (!statusFilter || statusFilter === 'all' || statusFilter === 'incidents') {
        return categoryFilteredReports.filter((report) => (
            includePending
                ? ['pending', 'verified', 'transferred', 'responding'].includes(report.status)
                : ['verified', 'transferred', 'responding'].includes(report.status)
        ));
    }

    if (statusFilter === 'pending') {
        return includePending
            ? categoryFilteredReports.filter((report) => report.status === 'pending')
            : [];
    }

    if (statusFilter === 'verified') {
        return categoryFilteredReports.filter((report) => report.status === 'verified');
    }

    if (statusFilter === 'responding') {
        return categoryFilteredReports.filter((report) => report.status === 'responding');
    }

    if (statusFilter === 'transferred') {
        return categoryFilteredReports.filter((report) => report.status === 'transferred');
    }

    if (statusFilter === 'resolved') {
        return categoryFilteredReports.filter((report) => report.status === 'resolved');
    }

    return categoryFilteredReports;
};

export const groupReportsByMapLocation = (reports = [], precision = 5) => {
    const groups = new Map();

    getVisibleMapReports(reports, { includePending: true, includeRejected: true }).forEach((report) => {
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
