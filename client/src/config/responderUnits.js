/**
 * Responder unit types — the client's mirror of the server's source of truth.
 *
 * `server/config/responderUnits.js` owns this list: it is what validates the
 * value and what the `User.agency` enum is built from. The client cannot import
 * across the workspace boundary, so this mirror exists purely so the pickers can
 * render the options.
 *
 * Keep the two in step. The failure modes are asymmetric and both visible: a
 * value added on the server and not here is simply never offered, while a value
 * here that the server does not accept comes back as a 400 on submit.
 */
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
 * Display labels for the stored values. Only the two that are stored as
 * shouting-caps acronyms in the canonical list need one — the rest already read
 * as words.
 */
export const RESPONDER_UNIT_LABELS = Object.freeze({
    RESCUE: 'Rescue',
    MEDICAL: 'Medical',
    BARANGAY: 'Barangay',
});

/**
 * The agencies a municipal administrator may pick when creating a responder.
 *
 * Deliberately narrower than the canonical list above. `RESCUE` and `MEDICAL`
 * stay valid STORED values — accounts already carry them, and the server's
 * `User.agency` enum still accepts them — but they are no longer offered for a
 * new account.
 *
 * Narrowing the enum instead would be the wrong fix: Mongoose validates the enum
 * on every save, so removing a value that existing documents hold turns an
 * unrelated profile edit on those accounts into a validation error. That is the
 * exact failure the server's responderUnits module was written to prevent.
 * Validation narrows; storage stays permissive.
 */
export const CREATABLE_RESPONDER_UNIT_TYPES = Object.freeze(
    RESPONDER_UNIT_TYPES.filter((unitType) => !['RESCUE', 'MEDICAL'].includes(unitType)),
);

export const getResponderUnitLabel = (value) => RESPONDER_UNIT_LABELS[value] || value || '';

export default {
    RESPONDER_UNIT_TYPES,
    CREATABLE_RESPONDER_UNIT_TYPES,
    RESPONDER_UNIT_LABELS,
    getResponderUnitLabel,
};
