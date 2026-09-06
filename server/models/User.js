import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { PASSWORD_MAX_UTF8_BYTES, PASSWORD_MIN_CHARACTERS } from '../utils/passwordPolicy.js';

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
            enum: ['MDRRMO', 'PNP', 'Medical Team', 'BFP', null],
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
        },
        resetPasswordExpires: {
            type: Date,
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

const User = mongoose.model('User', userSchema);

export default User;
