/**
 * Socket.IO Service for Alert Broadcasting
 * Centralized service for managing real-time notifications and alerts
 */

/**
 * Broadcast verified report alert to all responder units in a municipality
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The verified report document
 * @param {String} municipalityId - Municipality ObjectId or name
 */
export const broadcastVerifiedReportToResponders = (io, report, municipalityId) => {
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available');
        return;
    }

    const alertData = {
        id: report._id,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        title: report.title,
        description: report.description,
        address: report.address,
        barangay: report.barangay,
        municipalityName: report.municipalityName,
        coordinates: report.coordinates,
        incidentTime: report.incidentTime,
        severity: report.severity,
        priority: report.priority,
        casualties: report.casualties,
        verifiedAt: report.verifiedAt,
        timestamp: new Date(),
    };

    // Broadcast to municipality-specific responder room
    const responderRoom = `municipality_${municipalityId}_responders`;
    io.to(responderRoom).emit('reportVerifiedAlert', alertData);

    console.log(`🚨 Alert broadcasted to ${responderRoom}:`, {
        reportId: report._id,
        location: report.address,
        severity: report.severity,
    });
};

/**
 * Broadcast multi-unit response notification
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The report document
 * @param {Object} responder - The responder who just responded
 * @param {String} unitName - Name of the responding unit
 * @param {String} unitType - Type of the responding unit
 */
export const broadcastMultiUnitResponse = (io, report, responder, unitName, unitType) => {
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available');
        return;
    }

    const responseData = {
        reportId: report._id,
        responder: {
            _id: responder._id,
            name: responder.name,
            unitName,
            unitType,
        },
        respondedAt: new Date(),
        totalResponders: report.responders ? report.responders.length : 1,
    };

    // Broadcast to all clients (public update)
    io.emit('multiUnitResponse', responseData);

    // Also broadcast to municipality-specific room (use municipalityName to match frontend rooms)
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('localUnitResponse', responseData);
    }

    console.log(`🚑 Multi-unit response broadcasted:`, {
        reportId: report._id,
        unit: `${unitType} - ${unitName}`,
        totalResponders: responseData.totalResponders,
    });
};

/**
 * Broadcast report verification to all clients (existing functionality)
 * @param {Object} io - Socket.IO instance
 * @param {Object} report - The verified report
 */
export const broadcastReportVerified = (io, report) => {
    if (!io) return;

    io.emit('reportVerified', {
        id: report._id,
        incidentCategory: report.incidentCategory,
        incidentType: report.incidentType,
        title: report.title,
        address: report.address,
        municipalityName: report.municipalityName,
        coordinates: report.coordinates,
        incidentTime: report.incidentTime,
        severity: report.severity,
        priority: report.priority,
        casualties: report.casualties,
    });

    // Notify municipality-specific channel (use municipalityName to match frontend rooms)
    if (report.municipalityName) {
        io.to(`municipality_${report.municipalityName}`).emit('localIncidentVerified', {
            id: report._id,
            incidentCategory: report.incidentCategory,
            address: report.address,
            severity: report.severity,
        });
    }
};

/**
 * Broadcast report rejection notification
 * @param {Object} io - Socket.IO instance
 * @param {String} reporterId - The reporter's user ID
 * @param {String} reportId - The report ID
 * @param {String} reason - Rejection reason
 */
export const broadcastReportRejected = (io, reporterId, reportId, reason) => {
    if (!io) return;

    io.to(`user_${reporterId}`).emit('reportRejected', {
        id: reportId,
        reason,
    });
};

/**
 * Join responder to municipality-specific responder room
 * Called when responder logs in
 * @param {Object} socket - Socket instance
 * @param {String} municipalityId - Municipality ID or name
 */
export const joinResponderRoom = (socket, municipalityId) => {
    const responderRoom = `municipality_${municipalityId}_responders`;
    socket.join(responderRoom);
    console.log(`👮 Responder joined room: ${responderRoom}`);
};

/**
 * Leave responder room
 * @param {Object} socket - Socket instance
 * @param {String} municipalityId - Municipality ID or name
 */
export const leaveResponderRoom = (socket, municipalityId) => {
    const responderRoom = `municipality_${municipalityId}_responders`;
    socket.leave(responderRoom);
    console.log(`👮 Responder left room: ${responderRoom}`);
};

export default {
    broadcastVerifiedReportToResponders,
    broadcastMultiUnitResponse,
    broadcastReportVerified,
    broadcastReportRejected,
    joinResponderRoom,
    leaveResponderRoom,
};
