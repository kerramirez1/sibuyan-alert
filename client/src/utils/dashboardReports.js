const getReportId = (report) => report?._id || report?.id || null;

export const mergeDashboardReport = (existingReport, incomingReport) => {
    const id = getReportId(incomingReport) || getReportId(existingReport);
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
    const id = getReportId(incomingReport);
    if (!id) return reports;

    const existingIndex = reports.findIndex((report) => getReportId(report) === id);
    if (existingIndex === -1) {
        const merged = mergeDashboardReport(null, incomingReport);
        return merged ? [merged, ...reports] : reports;
    }

    return reports.map((report, index) => (
        index === existingIndex ? mergeDashboardReport(report, incomingReport) : report
    ));
};

export const updateDashboardReportStatus = (reports, id, status) => {
    if (!id) return reports;
    return reports.map((report) => (
        getReportId(report) === id ? { ...report, status } : report
    ));
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
            const id = getReportId(report);
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
