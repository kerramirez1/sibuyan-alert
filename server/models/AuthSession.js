import mongoose from 'mongoose';

const authSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        refreshTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        csrfTokenHash: {
            type: String,
            required: true,
            select: false,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
        revokedAt: {
            type: Date,
            default: null,
            index: true,
        },
        revocationReason: {
            type: String,
            enum: ['rotated', 'logout', 'logout_all', 'credential_change', 'session_limit', 'security_replay', null],
            default: null,
        },
        replacedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AuthSession',
            default: null,
        },
        userAgent: {
            type: String,
            maxlength: 512,
            default: null,
        },
        ipAddress: {
            type: String,
            maxlength: 128,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

authSessionSchema.index({ user: 1, revokedAt: 1, expiresAt: 1 });

const AuthSession = mongoose.model('AuthSession', authSessionSchema);

export default AuthSession;
