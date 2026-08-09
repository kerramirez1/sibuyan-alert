import { describe, expect, test } from 'vitest';
import { getOperationalOnlineUsers } from '../utils/onlineOperationalUsers.js';

describe('getOperationalOnlineUsers', () => {
    test('returns only unique operational personnel from the assigned municipality', () => {
        const users = getOperationalOnlineUsers([
            {
                userId: 'responder-1',
                name: 'Responder One',
                role: 'responder',
                agency: 'PNP',
                assignedMunicipality: 'Cajidiocan',
                avatar: '/avatar.png',
                connectedAt: new Date(),
                privateField: 'not returned',
            },
            {
                userId: 'responder-1',
                name: 'Responder One duplicate socket',
                role: 'responder',
                agency: 'PNP',
                assignedMunicipality: 'Cajidiocan',
            },
            {
                userId: 'admin-1',
                name: 'Municipal Admin',
                role: 'municipal_admin',
                assignedMunicipality: 'Cajidiocan',
            },
            {
                userId: 'reporter-1',
                name: 'Citizen Reporter',
                role: 'reporter',
                assignedMunicipality: 'Cajidiocan',
            },
            {
                userId: 'responder-2',
                name: 'Other Municipality',
                role: 'responder',
                assignedMunicipality: 'Magdiwang',
            },
        ], 'Cajidiocan');

        expect(users).toEqual([
            {
                userId: 'responder-1',
                name: 'Responder One',
                role: 'responder',
                agency: 'PNP',
                assignedMunicipality: 'Cajidiocan',
                avatar: '/avatar.png',
            },
            {
                userId: 'admin-1',
                name: 'Municipal Admin',
                role: 'municipal_admin',
                agency: null,
                assignedMunicipality: 'Cajidiocan',
                avatar: null,
            },
        ]);
    });

    test('fails closed without a municipality or valid collection', () => {
        expect(getOperationalOnlineUsers([], '')).toEqual([]);
        expect(getOperationalOnlineUsers(null, 'Cajidiocan')).toEqual([]);
    });
});
