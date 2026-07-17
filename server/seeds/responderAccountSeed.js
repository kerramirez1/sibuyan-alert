import User from '../models/User.js';
import { getResponderAccountsConfig } from './seedConfig.js';

/**
 * Seed responder accounts from environment config.
 * Required env var:
 * - SEED_RESPONDER_ACCOUNTS_JSON (JSON array)
 */
export const seedResponderAccounts = async () => {
    try {
        const responderAccounts = getResponderAccountsConfig();
        if (responderAccounts.length === 0) {
            console.warn('⚠️ SEED_RESPONDER_ACCOUNTS_JSON is empty. Skipping responder account seeding.');
            return;
        }

        for (const responderData of responderAccounts) {
            const existing = await User.findOne({ email: responderData.email });

            if (!existing) {
                const responder = new User(responderData);
                await responder.save();
                console.log(`✅ Created ${responderData.agency} responder: ${responderData.name}`);
                console.log(`   📧 Email: ${responderData.email}`);
            } else {
                existing.role = responderData.role;
                existing.agency = responderData.agency;
                existing.assignedMunicipality = responderData.assignedMunicipality;
                existing.responderUnit = responderData.responderUnit;
                existing.isVerified = responderData.isVerified;
                existing.verificationStatus = responderData.verificationStatus;
                await existing.save();
                console.log(`🔄 Updated responder: ${responderData.name} -> ${responderData.agency}`);
            }
        }

        console.log('');
        console.log('✅ Responder accounts seeding completed');
        console.log('   Credentials are loaded from SEED_RESPONDER_ACCOUNTS_JSON.');
    } catch (error) {
        console.error('❌ Error seeding responder accounts:', error.message);
        throw error;
    }
};

export default { seedResponderAccounts };
