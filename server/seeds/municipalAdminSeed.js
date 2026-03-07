import User from '../models/User.js';
import { getMunicipalAdminsConfig } from './seedConfig.js';

/**
 * Seed Municipal Admin Accounts
 * One admin per municipality: Cajidiocan, Magdiwang, San Fernando
 */

export const seedMunicipalAdmins = async () => {
    try {
        const municipalAdmins = getMunicipalAdminsConfig();
        if (municipalAdmins.length === 0) {
            console.warn('⚠️ SEED_MUNICIPAL_ADMINS_JSON is empty. Skipping municipal admin seeding.');
            return;
        }

        for (const adminData of municipalAdmins) {
            const existing = await User.findOne({ email: adminData.email });

            if (!existing) {
                const admin = new User(adminData);
                await admin.save();
                console.log(`✅ Created municipal admin: ${adminData.name}`);
            } else {
                // Update existing account with correct role and details
                existing.role = adminData.role;
                existing.assignedMunicipality = adminData.assignedMunicipality;
                existing.isVerified = adminData.isVerified;
                existing.verificationStatus = adminData.verificationStatus;
                await existing.save();
                console.log(`🔄 Updated municipal admin: ${adminData.name} → role: ${adminData.role}`);
            }
        }

        console.log('✅ Municipal admins seeding completed');
    } catch (error) {
        console.error('❌ Error seeding municipal admins:', error.message);
        throw error;
    }
};

export default { seedMunicipalAdmins };
