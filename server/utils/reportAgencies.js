/**
 * Responding-agency derivation, shared by every report serializer.
 *
 * Why this module exists: the public feed exposed the full multi-unit set
 * (derived from `responders[]`) while the operational feed exposed only
 * `responderAgency`, which is set for the FIRST responder alone. Administrators
 * coordinating a multi-agency response therefore saw fewer agencies than the
 * general public — the inconsistency ran backwards.
 *
 * One implementation means the two feeds cannot disagree again.
 */

const normalizeAgency = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Distinct agencies responding to a report, in first-seen order.
 *
 * Reads both the legacy `responderAgency` mirror and the modern `responders[]`
 * array, so reports written before the array existed still report an agency.
 *
 * @param {Object} report
 * @returns {string[]}
 */
export const getRespondingAgencies = (report) => {
    const agencies = new Set();

    const legacyAgency = normalizeAgency(report?.responderAgency);
    if (legacyAgency) agencies.add(legacyAgency);

    const responders = Array.isArray(report?.responders) ? report.responders : [];
    for (const responder of responders) {
        const unitType = normalizeAgency(responder?.unitType);
        if (unitType) agencies.add(unitType);
    }

    return [...agencies];
};

export default { getRespondingAgencies };
