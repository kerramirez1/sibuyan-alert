const MAX_RISK_ZONE_ID_LENGTH = 128;

export const normalizeRiskZoneId = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') return '';

    const normalizedId = String(value).trim();
    if (!normalizedId || normalizedId.length > MAX_RISK_ZONE_ID_LENGTH) return '';

    return normalizedId;
};

export const getRiskZoneId = (zone) => (
    normalizeRiskZoneId(zone?._id ?? zone?.id)
);

export const buildRiskZoneMapTarget = (zone) => {
    const riskZoneId = getRiskZoneId(zone);
    if (!riskZoneId) return '/dashboard?view=map';

    return `/dashboard?view=map&riskZone=${encodeURIComponent(riskZoneId)}`;
};

export const findRiskZoneById = (zones, riskZoneId) => {
    const normalizedId = normalizeRiskZoneId(riskZoneId);
    if (!normalizedId || !Array.isArray(zones)) return null;

    return zones.find((zone) => getRiskZoneId(zone) === normalizedId) || null;
};
