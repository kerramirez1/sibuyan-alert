import User from '../models/User.js';
import {
    getLegacyEmailsToCleanup,
    getMunicipalAdminsConfig,
    getResponderAccountsConfig,
} from './seedConfig.js';

/**
 * Seed/Update admin + responder accounts from environment config.
 */
export const seedAdmins = async () => {
    try {
        const municipalAdmins = getMunicipalAdminsConfig();
        const responderAccounts = getResponderAccountsConfig();
        const oldEmails = getLegacyEmailsToCleanup();

        if (oldEmails.length > 0) {
            console.log('🗑️ Cleaning up legacy accounts...');
            const deleteResult = await User.deleteMany({ email: { $in: oldEmails } });
            console.log(`   Deleted ${deleteResult.deletedCount} legacy account(s)`);
        }

        if (municipalAdmins.length === 0 && responderAccounts.length === 0) {
            console.warn('⚠️ No admin/responder seed config found. Skipping admin seeding.');
            return;
        }

        const allAccounts = [...municipalAdmins, ...responderAccounts];
        const allEmails = allAccounts.map((a) => a.email);
        const existingUsers = await User.find({ email: { $in: allEmails } }).select('email');
        const existingEmails = new Set(existingUsers.map((u) => u.email));

        if (municipalAdmins.length > 0) {
            console.log('✨ Seeding municipal admin accounts...');
            for (const adminData of municipalAdmins) {
                if (existingEmails.has(adminData.email)) {
                    console.log(`   ⏭️ Exists: ${adminData.email}`);
                    continue;
                }

                await new User(adminData).save();
                console.log(`   ✅ Created: ${adminData.name}`);
                console.log(`      📧 Email: ${adminData.email}`);
            }
        }

        if (responderAccounts.length > 0) {
            console.log('');
            console.log('✨ Seeding responder accounts...');
            for (const responderData of responderAccounts) {
                if (existingEmails.has(responderData.email)) {
                    console.log(`   ⏭️ Exists: ${responderData.email}`);
                    continue;
                }

                await new User(responderData).save();
                console.log(`   ✅ Created: ${responderData.name}`);
                console.log(`      📧 Email: ${responderData.email}`);
            }
        }

        console.log('');
        console.log('✅ Admin/responder seeding completed');
        console.log('   Credentials are loaded from environment JSON config.');
    } catch (error) {
        console.error('❌ Error seeding admin accounts:', error.message);
        throw error;
    }
};

export default { seedAdmins };

