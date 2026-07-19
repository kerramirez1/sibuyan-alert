const SEVERITY_RANK = Object.freeze({
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
});

export const sortHighRiskZonesBySeverity = (zones = []) => [...zones].sort((left, right) => {
    const severityDifference = (SEVERITY_RANK[right?.severity] || 0) - (SEVERITY_RANK[left?.severity] || 0);
    if (severityDifference !== 0) return severityDifference;

    const rightCreatedAt = new Date(right?.createdAt || 0).getTime();
    const leftCreatedAt = new Date(left?.createdAt || 0).getTime();
    return rightCreatedAt - leftCreatedAt;
});

