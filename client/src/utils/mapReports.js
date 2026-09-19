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

/**
 * Bounding box of the reports that are actually on this viewer's map.
 *
 * Used to open the map on the incidents instead of on open water. It reads the
 * same array the markers are built from, which is the point: the camera can only
 * frame what the API already returned for this viewer, so framing an empty map
 * for a guest who is not allowed to see an incident is not a bug waiting to
 * happen — it is not expressible.
 *
 * Returns `[[west, south], [east, north]]` — MapLibre's corner order — or `null`
 * when nothing on the map has a usable coordinate, which is the caller's signal
 * to keep the island-wide default view.
 */
export const getMapReportBounds = (reports = []) => {
    if (!Array.isArray(reports) || reports.length === 0) return null;

    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    reports.forEach((report) => {
        const coords = getMapCoordinates(report);
        if (!coords) return;
        west = Math.min(west, coords.lng);
        east = Math.max(east, coords.lng);
        south = Math.min(south, coords.lat);
        north = Math.max(north, coords.lat);
    });

    if (!Number.isFinite(west) || !Number.isFinite(south)) return null;

    return [[west, south], [east, north]];
};

export const getVisibleMapReports = (reports = [], { includePending = false, includeRejected = false } = {}) => {
    if (!Array.isArray(reports)) return [];
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
} = {}) => {
    if (!Array.isArray(reports)) return [];
    const visibleReports = getVisibleMapReports(reports, { includePending });
    const categoryFilteredReports = category
        ? visibleReports.filter((report) => report.incidentCategory === category)
        : visibleReports;

    if (statusFilter === 'risk-zones') {
        return [];
    }

    // 'all' and 'incidents' select the same open report set (pending +
    // verified + transferred + responding); they differ only in hazard-layer
    // visibility, which isRiskZoneLayerVisibleForFilter resolves at the
    // map/legend level ('incidents' suppresses hazard zones).
    // 'active' is the pending-excluded subset (verified + transferred +
    // responding) so reporter tabs reconcile: All open = Pending + Active.
    // 'dispatch' is the verified + transferred pair — one tab for the one
    // operator situation "verified and waiting for a responder", matching the
    // admin's dispatch card count exactly.
    if (!statusFilter || statusFilter === 'all' || statusFilter === 'incidents') {
        return categoryFilteredReports.filter((report) => (
            includePending
                ? ['pending', 'verified', 'transferred', 'responding'].includes(report.status)
                : ['verified', 'transferred', 'responding'].includes(report.status)
        ));
    }

    if (statusFilter === 'active') {
        return categoryFilteredReports.filter((report) => (
            ['verified', 'transferred', 'responding'].includes(report.status)
        ));
    }

    if (statusFilter === 'dispatch') {
        return categoryFilteredReports.filter((report) => (
            ['verified', 'transferred'].includes(report.status)
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
    if (!Array.isArray(reports)) return [];
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
