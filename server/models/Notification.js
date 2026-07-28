import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        type: {
            type: String,
            enum: [
                'new_report',           // New accident report submitted
                'report_verified',      // Report was verified by admin
                'report_rejected',      // Report was rejected
                'report_responding',    // A responder is now responding
                'report_resolved',      // Report has been resolved
                'report_update',        // Reporter posted a situational update
                'reporter_verified',    // Reporter account verified
                'reporter_rejected',    // Reporter verification rejected
                'high_risk_alert',      // High-risk zone detected
                'system',               // System notification
                'report_transferred',   // Incident report transferred to another municipality
                'report_transfer_acknowledged', // Target municipality acknowledged a transfer
            ],
            required: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: true,
            maxlength: 500,
        },
        data: {
            type: Object, // Additional data (report ID, user ID, etc.)
            default: {},
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
        sentVia: {
            push: { type: Boolean, default: false },
            email: { type: Boolean, default: false },
            inApp: { type: Boolean, default: true },
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Auto-expire notifications after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static method to create and send notification
notificationSchema.statics.createAndSend = async function (data, io) {
    const notification = await this.create(data);

    // Emit via Socket.io for real-time in-app notification
    if (io && data.recipient) {
        io.to(`user_${data.recipient}`).emit('notification', {
            _id: notification._id,
            id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            isRead: false,
            createdAt: notification.createdAt,
        });
    }

    return notification;
};

// Get unread count for user
notificationSchema.statics.getUnreadCount = function (userId) {
    return this.countDocuments({ recipient: userId, isRead: false });
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
