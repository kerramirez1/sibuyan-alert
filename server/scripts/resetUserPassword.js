/**
 * Operations helper: reset a user's password through the User model so the
 * pre-save hook (bcrypt, cost 12) hashes it exactly the way login expects.
 * Never hand-edit password hashes in Atlas — invisible characters or typos
 * in the plaintext silently produce a valid-looking but unusable hash.
 *
 * Usage (PowerShell — password stays in your terminal only):
 *   $env:NEWPASS = 'NewSecurePass123'; node scripts/resetUserPassword.js user@example.com
 *
 * This also revokes existing sessions so the account re-authenticates cleanly.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import AuthSession from '../models/AuthSession.js';

const resetPassword = async () => {
    const email = (process.argv[2] || '').trim().toLowerCase();
    const newPassword = process.env.NEWPASS || '';

    if (!email || !newPassword) {
        console.error('Usage: $env:NEWPASS = \'NewPass123\'; node scripts/resetUserPassword.js user@example.com');
        process.exitCode = 1;
        return;
    }

    try {
        await connectDB();

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            console.error(`❌ No user found with email ${email}`);
            process.exitCode = 1;
            return;
        }

        user.password = newPassword;
        await user.save();

        const revoked = await AuthSession.updateMany(
            { user: user._id, revokedAt: null },
            { $set: { revokedAt: new Date(), revocationReason: 'credential_change' } }
        );

        console.log(`✅ Password reset for ${email} (role: ${user.role}).`);
        console.log(`   Revoked ${revoked.modifiedCount ?? 0} active session(s) — user must log in again.`);
    } catch (error) {
        console.error(`❌ Reset failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

resetPassword();
