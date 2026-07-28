export const getDashboardReportId = (report) => {
    const id = report?._id ?? report?.id;
    return id === null || id === undefined ? null : String(id);
};

export const mergeDashboardReport = (existingReport, incomingReport) => {
    const id = getDashboardReportId(incomingReport) || getDashboardReportId(existingReport);
    if (!id) return null;

    const existing = existingReport || {};
    const incoming = incomingReport || {};

    return {
        ...existing,
        ...incoming,
        _id: id,
        createdAt: existing.createdAt
            || incoming.createdAt
            || incoming.timestamp
            || incoming.incidentTime
            || null,
        respondedAt: existing.respondedAt || incoming.respondedAt || null,
        respondedBy: existing.respondedBy || incoming.respondedBy || null,
    };
};

export const upsertDashboardReport = (reports, incomingReport) => {
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

export const updateDashboardReportStatus = (reports, id, status) => {
    if (!id) return reports;
    const normalizedId = String(id);
    return reports.map((report) => (
        getDashboardReportId(report) === normalizedId ? { ...report, status } : report
    ));
};

export const removeDashboardReport = (reports, id) => {
    if (id === null || id === undefined) return reports;
    const normalizedId = String(id);
    return reports.filter((report) => getDashboardReportId(report) !== normalizedId);
};

export const deduplicateDashboardReports = (reports = []) => {
    const reportsById = new Map();
    const reportsWithoutId = [];

    reports.forEach((report) => {
        const id = getDashboardReportId(report);
        if (id) reportsById.set(id, report);
        else reportsWithoutId.push(report);
    });

    return [...reportsById.values(), ...reportsWithoutId];
};

export const fetchAllAdminReportPages = async (fetchPage, params = {}, pageSize = 250) => {
    const reportsById = new Map();
    let page = 1;
    let totalPages = 1;

    do {
        const response = await fetchPage({ ...params, page, limit: pageSize });
        const payload = response?.data?.data || {};
        const pageReports = Array.isArray(payload.reports) ? payload.reports : [];

        pageReports.forEach((report) => {
            const id = getDashboardReportId(report);
            if (id) reportsById.set(String(id), report);
        });

        const reportedPages = Number(payload.pagination?.pages);
        totalPages = Number.isFinite(reportedPages) && reportedPages > 0
            ? Math.floor(reportedPages)
            : 1;
        page += 1;
    } while (page <= totalPages);

    return Array.from(reportsById.values());
};
