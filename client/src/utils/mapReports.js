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
