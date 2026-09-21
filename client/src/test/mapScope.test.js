import { describe, expect, test } from 'vitest';
import {
    DEFAULT_MAP_SCOPE,
    MAP_SCOPE_ISLAND,
    MAP_SCOPE_MUNICIPALITY,
    MAP_SCOPE_OPTIONS,
    canUseMapScope,
    getIslandMapScopeCacheKey,
    getMapScopeCaption,
    getMapScopePhrase,
    isIslandMapScope,
    mergeMapScopeReports,
    normalizeMapScope,
} from '../utils/mapScope';

describe('mapScope utility', () => {
    test('only the municipal administrator has a scope to switch', () => {
        expect(canUseMapScope('municipal_admin')).toBe(true);
        expect(canUseMapScope('responder')).toBe(false);
        expect(canUseMapScope('reporter')).toBe(false);
        expect(canUseMapScope('ordinary')).toBe(false);
        expect(canUseMapScope(undefined)).toBe(false);
    });

    test('the default scope is the administrator\'s own municipality', () => {
        expect(DEFAULT_MAP_SCOPE).toBe(MAP_SCOPE_MUNICIPALITY);
        expect(normalizeMapScope(undefined)).toBe(MAP_SCOPE_MUNICIPALITY);
        expect(normalizeMapScope(null)).toBe(MAP_SCOPE_MUNICIPALITY);
        expect(normalizeMapScope('')).toBe(MAP_SCOPE_MUNICIPALITY);
        expect(isIslandMapScope('Cajidiocan')).toBe(false);
        expect(normalizeMapScope(MAP_SCOPE_ISLAND)).toBe(MAP_SCOPE_ISLAND);
        expect(isIslandMapScope(MAP_SCOPE_ISLAND)).toBe(true);
    });

    test('the control offers exactly two options and never names a municipality as a choice', () => {
        expect(MAP_SCOPE_OPTIONS.map((option) => option.value)).toEqual([
            MAP_SCOPE_MUNICIPALITY,
            MAP_SCOPE_ISLAND,
        ]);
        // A municipality name here would make the control read as a municipality
        // picker, which is the one thing it must not be — the administrator's own
        // municipality comes from the session.
        expect(MAP_SCOPE_OPTIONS.map((option) => option.label)).toEqual([
            'My Municipality',
            'Entire Sibuyan Island',
        ]);
    });

    test('scope copy names the area the map is drawing', () => {
        expect(getMapScopePhrase(MAP_SCOPE_MUNICIPALITY, 'Cajidiocan')).toBe('in Cajidiocan');
        expect(getMapScopePhrase(MAP_SCOPE_ISLAND, 'Cajidiocan')).toBe('across Sibuyan Island');
        expect(getMapScopeCaption(MAP_SCOPE_ISLAND, 'Cajidiocan')).toBe('Viewing incidents across Sibuyan Island');
        expect(getMapScopeCaption(MAP_SCOPE_MUNICIPALITY, 'Cajidiocan')).toBe('Viewing incidents in Cajidiocan');
        // No assignment is still a legible sentence rather than "in undefined".
        expect(getMapScopePhrase(MAP_SCOPE_MUNICIPALITY, '')).toBe('in your municipality');
    });

    test('the island cache key is scoped per account and municipality', () => {
        const key = getIslandMapScopeCacheKey({ municipality: 'Magdiwang', userId: 'admin-1' });
        expect(key).toBe('dashboard:island-scope:Magdiwang:admin-1');
        expect(getIslandMapScopeCacheKey({ municipality: 'Cajidiocan', userId: 'admin-1' })).not.toBe(key);
        expect(getIslandMapScopeCacheKey({ municipality: 'Magdiwang', userId: 'admin-2' })).not.toBe(key);
        // Never a bare key: an unassigned or anonymous caller must still not be
        // able to read the previous one's snapshot.
        expect(getIslandMapScopeCacheKey({})).toBe('dashboard:island-scope:unassigned:unknown');
    });

    describe('mergeMapScopeReports', () => {
        const municipalityReports = [
            { _id: 'own-1', municipalityName: 'Cajidiocan', status: 'pending', reporter: { name: 'Ana' } },
        ];
        const islandReports = [
            { _id: 'own-1', municipalityName: 'Cajidiocan', status: 'pending' },
            { _id: 'foreign-1', municipalityName: 'Magdiwang', status: 'verified' },
            { _id: 'foreign-2', municipalityName: 'San Fernando', status: 'responding' },
        ];

        test('municipality scope is the operational set, unchanged', () => {
            const merged = mergeMapScopeReports({
                scope: MAP_SCOPE_MUNICIPALITY,
                municipalityReports,
                islandReports,
            });

            expect(merged.map((report) => report._id)).toEqual(['own-1']);
        });

        test('island scope adds the other municipalities without losing own records', () => {
            const merged = mergeMapScopeReports({
                scope: MAP_SCOPE_ISLAND,
                municipalityReports,
                islandReports,
            });

            expect(merged.map((report) => report._id).sort()).toEqual(['foreign-1', 'foreign-2', 'own-1']);
        });

        test('the operational record wins the id collision, whatever order it arrives in', () => {
            const merged = mergeMapScopeReports({
                scope: MAP_SCOPE_ISLAND,
                municipalityReports,
                // Island set deliberately lists the shared incident last: the merge
                // must not depend on which array happened to carry it later.
                islandReports: [...islandReports, { _id: 'own-1', status: 'verified' }],
            });

            const own = merged.filter((report) => report._id === 'own-1');
            expect(own).toHaveLength(1);
            // The fuller, action-carrying record: the one with its reporter on it.
            expect(own[0].reporter).toEqual({ name: 'Ana' });
        });

        test('a missing or malformed set is treated as empty rather than throwing', () => {
            expect(mergeMapScopeReports({ scope: MAP_SCOPE_ISLAND })).toEqual([]);
            expect(mergeMapScopeReports({
                scope: MAP_SCOPE_ISLAND,
                municipalityReports: null,
                islandReports: 'not-an-array',
            })).toEqual([]);
            expect(mergeMapScopeReports({
                scope: MAP_SCOPE_ISLAND,
                municipalityReports: [null, undefined],
                islandReports: [null],
            })).toEqual([]);
        });

        test('switching back to municipality scope drops every foreign marker immediately', () => {
            const island = mergeMapScopeReports({
                scope: MAP_SCOPE_ISLAND,
                municipalityReports,
                islandReports,
            });
            expect(island.some((report) => report.municipalityName === 'Magdiwang')).toBe(true);

            const back = mergeMapScopeReports({
                scope: MAP_SCOPE_MUNICIPALITY,
                municipalityReports,
                islandReports,
            });
            expect(back.some((report) => report.municipalityName === 'Magdiwang')).toBe(false);
        });
    });
});
