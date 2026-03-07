import Municipality from '../models/Municipality.js';

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
        barangays: [
            { name: 'Alibagon', center: { lat: 12.3944, lng: 122.6797 } },
            { name: 'Cambajao', center: { lat: 12.4144, lng: 122.6997 } },
            { name: 'Cambalo', center: { lat: 12.4044, lng: 122.6697 } },
            { name: 'Cambijang', center: { lat: 12.3844, lng: 122.6897 } },
            { name: 'Cantagda', center: { lat: 12.4244, lng: 122.6797 } },
            { name: 'Danao Norte', center: { lat: 12.4144, lng: 122.7097 } },
            { name: 'Danao Sur', center: { lat: 12.3944, lng: 122.7097 } },
            { name: 'Lico', center: { lat: 12.4044, lng: 122.6597 } },
            { name: 'Lumbang Este', center: { lat: 12.4344, lng: 122.6897 } },
            { name: 'Lumbang Weste', center: { lat: 12.4344, lng: 122.6697 } },
            { name: 'Marigondon Norte', center: { lat: 12.4144, lng: 122.6597 } },
            { name: 'Marigondon Sur', center: { lat: 12.3944, lng: 122.6597 } },
            { name: 'Poblacion', center: { lat: 12.4044, lng: 122.6897 } },
            { name: 'Sugod', center: { lat: 12.3744, lng: 122.6797 } },
            { name: 'Taguilos', center: { lat: 12.4244, lng: 122.7097 } },
        ],
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
        barangays: [
            { name: 'Agsao', center: { lat: 12.4878, lng: 122.5197 } },
            { name: 'Agutay', center: { lat: 12.4578, lng: 122.4997 } },
            { name: 'Ambulong', center: { lat: 12.4978, lng: 122.5297 } },
            { name: 'Dulangan', center: { lat: 12.4678, lng: 122.5397 } },
            { name: 'Ipil', center: { lat: 12.4478, lng: 122.5097 } },
            { name: 'Jao-asan', center: { lat: 12.5078, lng: 122.5097 } },
            { name: 'Poblacion', center: { lat: 12.4778, lng: 122.5097 } },
            { name: 'Silum', center: { lat: 12.4878, lng: 122.4897 } },
            { name: 'Tampayan', center: { lat: 12.4678, lng: 122.4797 } },
        ],
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
        barangays: [
            { name: 'Azagra', center: { lat: 12.3636, lng: 122.5569 } },
            { name: 'Butong', center: { lat: 12.3436, lng: 122.5369 } },
            { name: 'Cabugao', center: { lat: 12.3336, lng: 122.5269 } },
            { name: 'Catmon', center: { lat: 12.3236, lng: 122.5469 } },
            { name: 'Lambingan', center: { lat: 12.3736, lng: 122.5369 } },
            { name: 'Mabolo', center: { lat: 12.3836, lng: 122.5569 } },
            { name: 'Otod', center: { lat: 12.3536, lng: 122.5269 } },
            { name: 'Pili', center: { lat: 12.3136, lng: 122.5569 } },
            { name: 'Poblacion', center: { lat: 12.3536, lng: 122.5469 } },
            { name: 'San Isidro', center: { lat: 12.3936, lng: 122.5469 } },
            { name: 'Taclobo', center: { lat: 12.3436, lng: 122.5169 } },
            { name: 'Tuburan', center: { lat: 12.3736, lng: 122.5669 } },
        ],
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
        // Check if municipalities already exist
        const existingCount = await Municipality.countDocuments();

        if (existingCount > 0) {
            console.log('📍 Municipalities already seeded. Skipping...');
            return;
        }

        // Insert municipalities
        await Municipality.insertMany(sibuyanMunicipalities);
        console.log('✅ Sibuyan municipalities seeded successfully!');
        console.log('   - Cajidiocan');
        console.log('   - Magdiwang');
        console.log('   - San Fernando');
    } catch (error) {
        console.error('❌ Error seeding municipalities:', error);
        throw error;
    }
};

export default seedMunicipalities;
