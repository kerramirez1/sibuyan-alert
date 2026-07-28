import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const { MONGODB_URI, RESPONDER_CHECK_PASSWORD } = process.env;

if (!MONGODB_URI || !RESPONDER_CHECK_PASSWORD) {
    throw new Error(
        'MONGODB_URI and RESPONDER_CHECK_PASSWORD must be provided through the environment'
    );
}

const userSchema = new mongoose.Schema({
    email: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, required: true },
    assignedMunicipality: { type: String },
    agency: { type: String },
    isVerified: { type: Boolean },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

const checkResponders = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        const responders = await User.find({ role: 'responder' })
            .select('email password agency assignedMunicipality isVerified');

        console.log(`Found ${responders.length} responder accounts.`);
        for (const responder of responders) {
            const passwordMatches = await bcrypt.compare(
                RESPONDER_CHECK_PASSWORD,
                responder.password
            );
            console.log({
                email: responder.email,
                agency: responder.agency,
                municipality: responder.assignedMunicipality,
                passwordMatches,
                verified: responder.isVerified,
            });
        }
    } finally {
        await mongoose.disconnect();
    }
};

checkResponders().catch((error) => {
    console.error('Responder account check failed:', error.message);
    process.exitCode = 1;
});
