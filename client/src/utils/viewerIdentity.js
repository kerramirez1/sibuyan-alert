/**
 * Anonymous viewer identity for reach counting.
 *
 * Reach answers "how many distinct people opened this record?", which needs a
 * stable per-viewer key. For signed-in users that key is the account id. For
 * guests it has to come from somewhere else, and the honest options are limited:
 *
 * - **MAC address: not available.** A browser cannot read it. It is a layer-2
 *   identifier, it is exposed by no web API, and it is not sent in HTTP
 *   requests. This was never a viable key.
 * - **IP address: actively harmful.** A barangay wifi is one public IP, so
 *   keying on IP would collapse an entire village into a single viewer — worse
 *   than the double-counting it was meant to prevent. Mobile IPs also rotate.
 * - **A first-party random id: what this file does.**
 *
 * The id is opaque, random and meaningless on its own. It is not derived from
 * anything about the device, and it is never sent anywhere except as the
 * anonymous half of a viewer key.
 *
 * Known limits, stated plainly so nobody mistakes these counts for an audit:
 * private browsing and cleared storage both mint a fresh id, and a determined
 * user could forge one. This solves accidental double-counting — refresh, back
 * navigation, revisiting — not manipulation.
 */

const STORAGE_KEY = 'sibuyan.viewerKey';

/**
 * Must stay in step with VIEWER_KEY_PATTERN in server/models/ViewEvent.js.
 * A stored value that does not match is discarded rather than sent, so a
 * corrupted entry self-heals instead of permanently blocking that browser from
 * being counted.
 */
const ANON_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

/**
 * RFC 4122 version 4 UUID.
 *
 * `crypto.randomUUID` is preferred but only exists in a secure context, so a
 * plain-HTTP LAN address would silently have no id at all. The fallback sets the
 * version and variant bits by hand, which is what makes the result a real v4
 * rather than 16 random bytes wearing a UUID's punctuation.
 */
const createUuidV4 = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Returns this browser's anonymous viewer id, creating it on first use.
 *
 * @returns {string|null} The id, or null when storage is unavailable.
 */
export const getAnonymousViewerId = () => {
    if (typeof window === 'undefined' || !window.localStorage) return null;

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && ANON_ID_PATTERN.test(stored)) return stored;

        const created = createUuidV4();
        window.localStorage.setItem(STORAGE_KEY, created);
        return created;
    } catch {
        // Storage can throw on write in private modes. Returning null makes the
        // view unattributable, and an unattributable view is deliberately not
        // counted — better a missing data point than every id-less browser
        // sharing one bucket and inflating reach.
        return null;
    }
};

/**
 * Forgets this browser's anonymous id. Exposed for tests and for a future
 * "reset my anonymous data" control.
 */
export const clearAnonymousViewerId = () => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do: the id simply stays until storage is available again.
    }
};

export default { getAnonymousViewerId, clearAnonymousViewerId };
