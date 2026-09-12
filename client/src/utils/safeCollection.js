/**
 * Production-safe collection and identity helpers.
 *
 * Single Responsibility: normalize untrusted API / socket / cache shapes into
 * crash-proof primitives. Every helper is pure, total (never throws on
 * null/undefined/legacy shapes), and safe to call in render paths.
 */

/** Return `value` when it is an array, otherwise `fallback` (default `[]`). */
export const toSafeArray = (value, fallback = []) => (
    Array.isArray(value) ? value : fallback
);

/** Crash-proof `.length` for possibly-null collections. */
export const safeCount = (value) => (Array.isArray(value) ? value.length : 0);

/**
 * Normalize a municipality / free-form identity string for comparison.
 * Non-strings (legacy numbers, objects, null) become `''` instead of throwing
 * on `.trim().toLowerCase()`.
 */
export const normalizeMunicipalityKey = (value) => {
    if (typeof value !== 'string') {
        if (value === null || value === undefined) return '';
        try {
            return String(value).trim().toLocaleLowerCase();
        } catch {
            return '';
        }
    }
    return value.trim().toLocaleLowerCase();
};

/** Case-insensitive municipality equality that never throws. */
export const isSameMunicipality = (left, right) => {
    const a = normalizeMunicipalityKey(left);
    const b = normalizeMunicipalityKey(right);
    return Boolean(a) && a === b;
};

/**
 * Resolve a stable React key / API id across legacy `_id` vs `id` shapes.
 * Returns `''` when neither exists so callers can filter/skip explicitly.
 */
export const getEntityKey = (entity, fallback = '') => {
    if (!entity || typeof entity !== 'object') return fallback;
    const raw = entity._id ?? entity.id ?? fallback;
    if (raw === null || raw === undefined) return fallback;
    try {
        return String(raw) || fallback;
    } catch {
        return fallback;
    }
};

/** Resolve a notification id across `_id` / `id` shapes (null when missing). */
export const getNotificationId = (notification) => {
    if (!notification || typeof notification !== 'object') return null;
    const raw = notification._id ?? notification.id ?? null;
    if (raw === null || raw === undefined || raw === '') return null;
    try {
        return String(raw);
    } catch {
        return null;
    }
};

/** Filter out nullish entries from photo/attachment arrays without throwing. */
export const toSafePhotos = (value) => toSafeArray(value).filter(Boolean);

export default {
    toSafeArray,
    safeCount,
    normalizeMunicipalityKey,
    isSameMunicipality,
    getEntityKey,
    getNotificationId,
    toSafePhotos,
};
