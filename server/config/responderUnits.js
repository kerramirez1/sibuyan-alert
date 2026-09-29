/**
 * Canonical responder unit types — the single source of truth.
 *
 * Why this module exists: the same list was previously written out in five
 * places, and one of them had drifted. `Report.responders[].unitType` accepted
 * seven values while the legacy `Report.responderAgency` mirror accepted only
 * four, so a Barangay Rescue or Medical Response unit becoming the first
 * responder to an incident threw a Mongoose ValidationError and the response
 * was never recorded. Nothing about that failure was visible to the responder.
 *
 * Any code that validates, stores, or displays a responder unit type must read
 * the list from here. Adding a unit type is now a one-line change that cannot
 * leave a field behind.
 */

/** The only values a responder unit type may take. */
export const RESPONDER_UNIT_TYPES = Object.freeze([
    'MDRRMO',
    'PNP',
    'BFP',
    'Medical Team',
    'RESCUE',
    'MEDICAL',
    'BARANGAY',
]);

/**
 * Legacy aliases still present in stored data.
 *
 * `LGU` predates the MDRRMO naming and appears on older responder accounts.
 * It is normalised rather than rejected so historical accounts keep working
 * without a migration.
 */
export const LEGACY_UNIT_TYPE_ALIASES = Object.freeze({ LGU: 'MDRRMO' });

/** Values accepted from stored data, including legacy aliases. */
export const ACCEPTED_UNIT_TYPE_VALUES = Object.freeze([
    ...RESPONDER_UNIT_TYPES,
    ...Object.keys(LEGACY_UNIT_TYPE_ALIASES),
]);

export const isSupportedResponderUnitType = (value) => (
    RESPONDER_UNIT_TYPES.includes(value)
);

/** Maps a legacy alias to its canonical value; passes everything else through. */
export const normalizeUnitType = (value) => LEGACY_UNIT_TYPE_ALIASES[value] ?? value;

/**
 * The unit types a municipal administrator may assign when provisioning a NEW
 * responder.
 *
 * Narrower than `RESPONDER_UNIT_TYPES` on purpose. `RESCUE` and `MEDICAL` remain
 * valid STORED values — the `User.agency` enum still accepts them, so existing
 * accounts keep saving — but they are no longer offered for a new account.
 *
 * Keep the enum wide and the intake narrow. Removing a value from the enum that
 * existing documents hold would turn an unrelated save on those accounts into a
 * validation error, which is the exact failure this module exists to prevent.
 */
export const CREATABLE_UNIT_TYPES = Object.freeze(
    RESPONDER_UNIT_TYPES.filter((value) => !['RESCUE', 'MEDICAL'].includes(value)),
);

/** Human-readable label for display, defaulting to the raw value. */
export const getUnitTypeLabel = (value) => normalizeUnitType(value) || '';

export default {
    RESPONDER_UNIT_TYPES,
    CREATABLE_UNIT_TYPES,
    LEGACY_UNIT_TYPE_ALIASES,
    ACCEPTED_UNIT_TYPE_VALUES,
    isSupportedResponderUnitType,
    normalizeUnitType,
    getUnitTypeLabel,
};
