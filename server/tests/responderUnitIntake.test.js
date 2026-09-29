import { describe, expect, test } from 'vitest';
import {
    RESPONDER_UNIT_TYPES,
    ACCEPTED_UNIT_TYPE_VALUES,
    CREATABLE_UNIT_TYPES,
} from '../config/responderUnits.js';

/**
 * Two lists that must not be the same list.
 *
 * `CREATABLE_UNIT_TYPES` is what a municipal administrator may assign to a NEW
 * responder; `ACCEPTED_UNIT_TYPE_VALUES` is what the `User.agency` enum will
 * still store. RESCUE and MEDICAL were removed from the first and deliberately
 * left in the second.
 *
 * The distinction is load-bearing: Mongoose validates the enum on every save, so
 * removing a value that existing documents hold turns an unrelated profile edit
 * on those accounts into a validation error.
 */
describe('responder unit types: intake vs storage', () => {
    test('RESCUE and MEDICAL are no longer offered for a new responder', () => {
        expect(CREATABLE_UNIT_TYPES).not.toContain('RESCUE');
        expect(CREATABLE_UNIT_TYPES).not.toContain('MEDICAL');
    });

    test('they remain valid stored values', () => {
        expect(RESPONDER_UNIT_TYPES).toContain('RESCUE');
        expect(RESPONDER_UNIT_TYPES).toContain('MEDICAL');
        expect(ACCEPTED_UNIT_TYPE_VALUES).toContain('RESCUE');
        expect(ACCEPTED_UNIT_TYPE_VALUES).toContain('MEDICAL');
    });

    test('every creatable value is also storable', () => {
        for (const value of CREATABLE_UNIT_TYPES) {
            expect(ACCEPTED_UNIT_TYPE_VALUES).toContain(value);
        }
    });

    test('the creatable list keeps the remaining agencies', () => {
        expect([...CREATABLE_UNIT_TYPES]).toEqual(['MDRRMO', 'PNP', 'BFP', 'Medical Team', 'BARANGAY']);
    });
});
