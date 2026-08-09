const OPERATIONAL_ROLES = new Set(['municipal_admin', 'responder']);

const toPublicOperationalPresence = (entry) => ({
    userId: entry.userId,
    name: entry.name,
    role: entry.role,
    assignedMunicipality: entry.assignedMunicipality,
    agency: entry.agency || null,
    avatar: entry.avatar || null,
});

export const getOperationalOnlineUsers = (entries, municipality) => {
    if (!municipality || !Array.isArray(entries)) return [];

    const uniqueUsers = [];
    const seenUserIds = new Set();

    for (const entry of entries) {
        if (
            !entry?.userId
            || entry.assignedMunicipality !== municipality
            || !OPERATIONAL_ROLES.has(entry.role)
            || seenUserIds.has(entry.userId)
        ) {
            continue;
        }

        seenUserIds.add(entry.userId);
        uniqueUsers.push(toPublicOperationalPresence(entry));
    }

    return uniqueUsers;
};
