import Municipality from '../models/Municipality.js';
import { getOfficialBarangayRecords } from '../config/sibuyanLocations.js';

/**
 * Seed Sibuyan Island Municipalities
 * The 3 municipalities of Sibuyan Island, Romblon
 */
const sibuyanMunicipalities = [
    {
        name: 'Cajidiocan',
        code: 'CAJ',
        center: {
            lat: 12.4044,
            lng: 122.6897,
        },
        bounds: {
            minLat: 12.35,
            maxLat: 12.45,
            minLng: 122.60,
            maxLng: 122.75,
        },
        barangays: getOfficialBarangayRecords('Cajidiocan'),
        emergencyContacts: [
            { department: 'police', name: 'Cajidiocan PNP', phone: '042-123-4567', isActive: true },
            { department: 'medical', name: 'Cajidiocan RHU', phone: '042-123-4568', isActive: true },
            { department: 'municipal', name: 'Municipal Hall', phone: '042-123-4569', isActive: true },
            { department: 'rescue', name: 'MDRRMO Cajidiocan', phone: '042-123-4570', isActive: true },
        ],
        responseCapabilities: {
            hasFireStation: false,
            hasPoliceStation: true,
            hasHealthCenter: true,
            hasRescueUnit: true,
            ambulanceCount: 1,
            firetruckCount: 0,
        },
    },
    {
        name: 'Magdiwang',
        code: 'MAG',
        center: {
            lat: 12.4778,
            lng: 122.5097,
        },
        bounds: {
            minLat: 12.42,
            maxLat: 12.55,
            minLng: 122.45,
            maxLng: 122.60,
        },
        barangays: getOfficialBarangayRecords('Magdiwang'),
        emergencyContacts: [
            { department: 'police', name: 'Magdiwang PNP', phone: '042-234-5678', isActive: true },
            { department: 'medical', name: 'Magdiwang RHU', phone: '042-234-5679', isActive: true },
            { department: 'municipal', name: 'Municipal Hall', phone: '042-234-5680', isActive: true },
            { department: 'rescue', name: 'MDRRMO Magdiwang', phone: '042-234-5681', isActive: true },
        ],
        responseCapabilities: {
            hasFireStation: false,
            hasPoliceStation: true,
            hasHealthCenter: true,
            hasRescueUnit: true,
            ambulanceCount: 1,
            firetruckCount: 0,
        },
    },
    {
        name: 'San Fernando',
        code: 'SFN',
        center: {
            lat: 12.3536,
            lng: 122.5469,
        },
        bounds: {
            minLat: 12.30,
            maxLat: 12.42,
            minLng: 122.45,
            maxLng: 122.60,
        },
        barangays: getOfficialBarangayRecords('San Fernando'),
        emergencyContacts: [
            { department: 'police', name: 'San Fernando PNP', phone: '042-345-6789', isActive: true },
            { department: 'medical', name: 'San Fernando RHU', phone: '042-345-6790', isActive: true },
            { department: 'fire', name: 'San Fernando BFP', phone: '042-345-6791', isActive: true },
            { department: 'municipal', name: 'Municipal Hall', phone: '042-345-6792', isActive: true },
            { department: 'rescue', name: 'MDRRMO San Fernando', phone: '042-345-6793', isActive: true },
        ],
        responseCapabilities: {
            hasFireStation: true,
            hasPoliceStation: true,
            hasHealthCenter: true,
            hasRescueUnit: true,
            ambulanceCount: 2,
            firetruckCount: 1,
        },
    },
];

export const seedMunicipalities = async () => {
    try {
        // Synchronize official geographic names on every startup so databases
        // created by older releases do not retain obsolete barangay options.
        // Existing locally maintained contacts and capabilities are preserved.
        await Municipality.bulkWrite(sibuyanMunicipalities.map((municipality) => ({
            updateOne: {
                filter: { name: municipality.name },
                update: {
                    $set: {
                        code: municipality.code,
                        center: municipality.center,
                        bounds: municipality.bounds,
                        barangays: municipality.barangays,
                        isActive: true,
                    },
                    $setOnInsert: {
                        emergencyContacts: municipality.emergencyContacts,
                        responseCapabilities: municipality.responseCapabilities,
                    },
                },
                upsert: true,
            },
        })));

        console.log('Sibuyan municipality and barangay reference data synchronized.');
    } catch (error) {
        console.error('❌ Error seeding municipalities:', error);
        throw error;
    }
};

export default seedMunicipalities;
