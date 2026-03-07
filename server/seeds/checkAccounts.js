import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const checkAccounts = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Check Municipal Admins
        const municipalAdmins = await User.find({ role: 'municipal_admin' });
        console.log('🏛️  MUNICIPAL ADMINS:');
        if (municipalAdmins.length > 0) {
            municipalAdmins.forEach(admin => {
                console.log(`   ✓ ${admin.name} (${admin.email}) - ${admin.assignedMunicipality}`);
            });
        } else {
            console.log('   ❌ No municipal admins found');
        }

        console.log('');

        // Check Responders
        const responders = await User.find({ role: 'responder' });
        console.log('🚑 RESPONDER ACCOUNTS:');
        if (responders.length > 0) {
            responders.forEach(resp => {
                console.log(`   ✓ ${resp.name} (${resp.email}) - ${resp.assignedMunicipality}`);
            });
        } else {
            console.log('   ❌ No responder accounts found');
        }

        console.log('');

        // Check Old Admins (should be deleted)
        const oldAdmins = await User.find({ role: 'admin' });
        console.log('🔍 OLD ADMIN ACCOUNTS (should be clean):');
        if (oldAdmins.length > 0) {
            oldAdmins.forEach(admin => {
                console.log(`   ⚠️  ${admin.name} (${admin.email}) - Agency: ${admin.agency || 'N/A'}`);
            });
        } else {
            console.log('   ✅ All old admin accounts cleaned');
        }

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

checkAccounts();
