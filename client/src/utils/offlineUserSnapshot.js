/**
 * Offline session-grace identity snapshot.
 *
 * When a verified reporter cold-starts the app with no connection, /auth/me
 * cannot be reached and the HttpOnly session cookie cannot be validated. This
 * snapshot lets the app restore a degraded, explicitly-marked offline identity
 * ({ ...snapshot, offline: true }) so the reporter can still reach the report
 * form and queue reports for auto-send on reconnect.
 *
 * It holds identity claims only — id, role, name, verification status — never
 * a credential or token. The HttpOnly cookie remains the real session: nothing
 * here can authenticate a request, and queued reports still deliver only under
 * a live, server-validated session.
 */

export const OFFLINE_USER_KEY = 'sibuyan-alert:offline-user';

// A week: long enough to cover a multi-day field trip with no signal, short
// enough that a stale role or a deactivated account cannot linger.
export const OFFLINE_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reads the snapshot when it is usable for offline grace: present,
 * well-formed, fresh, and belonging to a reporter. Anything else returns null
 * so callers fall back to the signed-out path.
 */
export const readOfflineSnapshot = () => {
    try {
        const raw = localStorage.getItem(OFFLINE_USER_KEY);
        if (!raw) return null;
        const snapshot = JSON.parse(raw);
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
        if (snapshot.role !== 'reporter') return null;
        if (typeof snapshot.id !== 'string' || snapshot.id === '') return null;
        if (typeof snapshot.savedAt !== 'number'
            || Number.isNaN(snapshot.savedAt)
            || Date.now() - snapshot.savedAt > OFFLINE_SNAPSHOT_TTL_MS) return null;
        return snapshot;
    } catch {
        // Corrupt JSON or unavailable storage: no offline grace.
        return null;
    }
};

/**
 * Records the snapshot after a successful authentication. Reporter-only: no
 * other role can use offline grace, so no other role's identity lingers in
 * storage (matters on shared devices).
 */
export const writeOfflineSnapshot = (user) => {
    try {
        if (!user || user.role !== 'reporter') {
            localStorage.removeItem(OFFLINE_USER_KEY);
            return;
        }
        localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({
            id: user.id,
            role: user.role,
            name: user.name ?? null,
            reporterVerificationStatus: user.verificationStatus ?? null,
            savedAt: Date.now(),
        }));
    } catch {
        // Non-fatal: offline grace is a convenience, not a requirement.
    }
};

export const clearOfflineSnapshot = () => {
    try {
        localStorage.removeItem(OFFLINE_USER_KEY);
    } catch {
        // Non-fatal.
    }
};
