export const getDashboardReportId = (report) => {
    const rawId = report?._id ?? report?.id;
    // Extended-JSON object ids ({ $oid }) must not collapse to "[object Object]".
    const id = rawId && typeof rawId === 'object'
        ? rawId.$oid ?? rawId.id ?? rawId._id ?? null
        : rawId;
    return id === null || id === undefined ? null : String(id);
};

export const mergeDashboardReport = (existingReport, incomingReport) => {
    const id = getDashboardReportId(incomingReport) || getDashboardReportId(existingReport);
    if (!id) return null;

    const existing = existingReport || {};
    const incoming = incomingReport || {};
    const incomingResolverId = incoming.resolvedBy?._id ?? incoming.resolvedBy?.id;

    // Preserves existing evidence metadata and descriptors if incoming payload omits them
    const evidence = incoming.evidence !== undefined
        ? incoming.evidence
        : existing.evidence;
    const evidenceCount = incoming.evidenceCount !== undefined
        ? incoming.evidenceCount
        : existing.evidenceCount;
    const images = (Array.isArray(incoming.images) && incoming.images.length > 0)
        ? incoming.images
        : existing.images;

    return {
        ...existing,
        ...incoming,
        _id: id,
        evidence,
        evidenceCount,
        images,
        createdAt: existing.createdAt
            || incoming.createdAt
            || incoming.timestamp
            || incoming.incidentTime
            || null,
        respondedAt: existing.respondedAt || incoming.respondedAt || null,
        respondedBy: existing.respondedBy || incoming.respondedBy || null,
        resolvedBy: incomingResolverId
            ? incoming.resolvedBy
            : existing.resolvedBy || incoming.resolvedBy || null,
    };
};

export const upsertDashboardReport = (reports = [], incomingReport) => {
    if (!Array.isArray(reports)) return [];
    const id = getDashboardReportId(incomingReport);
    if (!id) return reports;

    const existingReport = reports.find((report) => getDashboardReportId(report) === id);
    if (!existingReport) {
        const merged = mergeDashboardReport(null, incomingReport);
        return merged ? [merged, ...reports] : reports;
    }

    const merged = mergeDashboardReport(existingReport, incomingReport);
    return [merged, ...reports.filter((report) => getDashboardReportId(report) !== id)];
};

export const updateDashboardReportStatus = (reports = [], id, status) => {
    if (!Array.isArray(reports)) return [];
    if (!id) return reports;
    const normalizedId = String(id);
    return reports.map((report) => (
        getDashboardReportId(report) === normalizedId ? { ...report, status } : report
    ));
};

export const removeDashboardReport = (reports = [], id) => {
    if (!Array.isArray(reports)) return [];
    if (id === null || id === undefined) return reports;
    const normalizedId = String(id);
    return reports.filter((report) => getDashboardReportId(report) !== normalizedId);
};

export const deduplicateDashboardReports = (reports = []) => {
    if (!Array.isArray(reports)) return [];
    const reportsById = new Map();
    const reportsWithoutId = [];

    reports.forEach((report) => {
        const id = getDashboardReportId(report);
        if (id) reportsById.set(id, report);
        else reportsWithoutId.push(report);
    });

    return [...reportsById.values(), ...reportsWithoutId];
};

// Paginates through every page of a report list endpoint (admin or public)
// so large datasets are loaded completely instead of silently truncating at
// the server's per-page limit. Records without an id are preserved in arrival
// order (like deduplicateDashboardReports) instead of being dropped.
export const fetchAllReportPages = async (fetchPage, params = {}, pageSize = 250) => {
    if (typeof fetchPage !== 'function') return [];
    const reportsById = new Map();
    const reportsWithoutId = [];
    let page = 1;
    let totalPages = 1;

    do {
        const response = await fetchPage({ ...params, page, limit: pageSize });
        const payload = response?.data?.data ?? response?.data ?? {};
        const rawReports = Array.isArray(payload?.reports)
            ? payload.reports
            : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];
        const pageReports = rawReports.filter(Boolean);

        pageReports.forEach((report) => {
            const id = getDashboardReportId(report);
            if (id) reportsById.set(String(id), report);
            else reportsWithoutId.push(report);
        });

        const reportedPages = Number(payload?.pagination?.pages ?? 1);
        totalPages = Number.isFinite(reportedPages) && reportedPages > 0
            ? Math.floor(reportedPages)
            : 1;
        page += 1;
    } while (page <= totalPages);

    return [...reportsById.values(), ...reportsWithoutId];
};
