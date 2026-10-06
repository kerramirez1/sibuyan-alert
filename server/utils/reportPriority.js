/**
 * Priority derivation for incident reports.
 *
 * Shared by the Report pre-save hook and the atomic verify path in
 * adminController (which uses findOneAndUpdate and therefore bypasses the
 * pre-save hook). The two call sites must never drift: a casualty correction
 * applied during verification recalculates priority exactly as a save would.
 *
 * @param {string} severity - report severity ('critical' | 'severe' | 'moderate' | ...)
 * @param {object} casualties - { injured, fatalities, missing }
 * @returns {'urgent' | 'high' | 'normal' | 'low'}
 */
export const calculateReportPriority = (severity, casualties) => {
    const totalCasualties = (casualties?.injured || 0)
        + (casualties?.fatalities || 0) * 3
        + (casualties?.missing || 0) * 2;

    if (severity === 'critical' || casualties?.fatalities > 0) {
        return 'urgent';
    }
    if (severity === 'severe' || totalCasualties >= 5) {
        return 'high';
    }
    if (severity === 'moderate' || totalCasualties >= 1) {
        return 'normal';
    }
    return 'low';
};

export default { calculateReportPriority };
