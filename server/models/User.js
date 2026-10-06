import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { PASSWORD_MAX_UTF8_BYTES, PASSWORD_MIN_CHARACTERS } from '../utils/passwordPolicy.js';
import { ACCEPTED_UNIT_TYPE_VALUES } from '../config/responderUnits.js';

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
        },
        password: {
            type: String,
            minlength: [PASSWORD_MIN_CHARACTERS, `Password must be at least ${PASSWORD_MIN_CHARACTERS} characters`],
            validate: {
                validator: (value) => !value || Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_UTF8_BYTES,
                message: 'Password exceeds the bcrypt 72-byte input limit',
            },
            select: false, // Don't return password by default
        },
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        role: {
            type: String,
            enum: ['ordinary', 'reporter', 'municipal_admin', 'responder'],
            default: 'ordinary',
        },
        // Municipality assignment for municipal admins and responders
        assignedMunicipality: {
            type: String,
            enum: ['Cajidiocan', 'Magdiwang', 'San Fernando', null],
            default: null,
            required: function requireOperationalMunicipality() {
                return ['municipal_admin', 'responder'].includes(this.role);
            },
        },
        // Responder unit details (e.g., "MDRRMO Rescue 1", "PNP Patrol 01")
        responderUnit: {
            type: String,
            default: null,
        },
        avatar: {
            type: String,
            default: null,
        },
        agency: {
            type: String,
            // Shares the canonical list, plus the legacy `LGU` alias that older
            // accounts still carry. Widening the enum is non-breaking; the
            // previous four-value list meant an operator seeding a BARANGAY or
            // MEDICAL account hit a validation error at boot.
            enum: [...ACCEPTED_UNIT_TYPE_VALUES, null],
            default: null,
        },
        address: {
            type: String,
            trim: true,
            maxlength: [300, 'Address cannot exceed 300 characters'],
            default: null,
        },
        barangay: {
            type: String,
            trim: true,
            maxlength: [100, 'Barangay cannot exceed 100 characters'],
            default: null,
        },
        idDocument: {
            type: String, // Private GridFS delivery URL for reporter ID verification
            default: null,
        },
        selfiePhoto: {
            type: String, // Private GridFS delivery URL for face verification selfie
            default: null,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        verificationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'not_required'],
            default: 'not_required',
        },
        verificationFeedback: {
            type: String, // Admin feedback for rejection
            default: null,
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        verifiedAt: {
            type: Date,
            default: null,
        },
        verificationHistory: {
            type: [{
                _id: false,
                action: {
                    type: String,
                    enum: ['id_submitted', 'id_resubmitted', 'approved', 'rejected'],
                    required: true,
                },
                actor: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    default: null,
                },
                feedback: {
                    type: String,
                    trim: true,
                    maxlength: 500,
                    default: null,
                },
                at: {
                    type: Date,
                    default: Date.now,
                },
            }],
            default: [],
            select: false,
        },
        pushSubscription: {
            type: Object, // Web push subscription object
            default: null,
        },
        notificationPreferences: {
            browserPush: { type: Boolean, default: true },
            inApp: { type: Boolean, default: true },
            email: { type: Boolean, default: false },
        },
        resetPasswordToken: {
            type: String,
            default: null,
            // Never returned by a query. This is the invitation secret too — a
            // provisioned responder sets their first password through the same
            // token — so it must not be able to appear in a user list, a log line
            // or any other response that happens to load the whole document.
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            default: null,
            select: false,
        },
        // Account-provisioning audit trail. Shaped like `verificationHistory`
        // because that is this model's existing convention for "who did what to
        // this account, and when" — one place per concern, not a second store.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            select: false,
        },
        provisioningHistory: {
            type: [{
                _id: false,
                action: {
                    type: String,
                    enum: ['invited', 'invitation_resent', 'invitation_failed', 'activated'],
                    required: true,
                },
                actor: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    default: null,
                },
                // Denormalised on purpose: the audit line must still say which
                // municipality the account was created for if the account is
                // later moved or the actor is deleted.
                municipality: {
                    type: String,
                    default: null,
                },
                at: {
                    type: Date,
                    default: Date.now,
                },
            }],
            default: [],
            select: false,
        },
        termsAcceptedAt: {
            type: Date,
            default: null,
        },
        termsVersion: {
            type: String,
            default: null,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    // Only hash if password is modified
    if (!this.isModified('password')) {
        return next();
    }

    // Don't hash if password is already hashed or empty
    if (!this.password) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) {
        return false;
    }
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.recordVerificationEvent = function ({ action, actor = null, feedback = null }) {
    if (!Array.isArray(this.verificationHistory)) this.verificationHistory = [];
    this.verificationHistory.push({ action, actor, feedback, at: new Date() });
    if (this.verificationHistory.length > 50) {
        this.verificationHistory.splice(0, this.verificationHistory.length - 50);
    }
};

/**
 * Appends one line to the account-provisioning audit trail.
 *
 * `municipality` is required because it is the fact the trail exists to record:
 * a municipal administrator may only ever create accounts for their own
 * municipality, so the line has to say which one was written.
 */
userSchema.methods.recordProvisioningEvent = function ({ action, actor = null, municipality = null }) {
    if (!Array.isArray(this.provisioningHistory)) this.provisioningHistory = [];
    this.provisioningHistory.push({ action, actor, municipality, at: new Date() });
    if (this.provisioningHistory.length > 50) {
        this.provisioningHistory.splice(0, this.provisioningHistory.length - 50);
    }
};

// Set verification status based on role
userSchema.pre('save', function (next) {
    if (this.isNew) {
        if (this.role === 'reporter') {
            this.verificationStatus = 'pending';
            this.isVerified = false;
        } else if (this.role === 'municipal_admin' || this.role === 'responder') {
            this.verificationStatus = 'not_required';
            this.isVerified = true;
        }
    }
    next();
});

// Virtual for full profile
userSchema.virtual('profile').get(function () {
    return {
        id: this._id,
        email: this.email,
        name: this.name,
        role: this.role,
        agency: this.agency,
        assignedMunicipality: this.assignedMunicipality,
        barangay: this.barangay,
        address: this.address,
        avatar: this.avatar,
        isVerified: this.isVerified,
        verificationStatus: this.verificationStatus,
    };
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// P2-4: operational lookups by role + municipality (responder/admin
// directory queries) and token lookups for password reset / invitation
// acceptance (sparse: most users have no token outstanding).
userSchema.index({ role: 1, assignedMunicipality: 1 });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

const User = mongoose.model('User', userSchema);

export default User;
