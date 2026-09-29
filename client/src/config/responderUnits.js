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

export const getResponderUnitLabel = (value) => RESPONDER_UNIT_LABELS[value] || value || '';

export default { RESPONDER_UNIT_TYPES, RESPONDER_UNIT_LABELS, getResponderUnitLabel };
