import hotToast from 'react-hot-toast';

export const APP_TOAST_DURATION_MS = 2500;
export const APP_TOAST_ID = 'app-notification';
const DEDUPE_WINDOW_MS = APP_TOAST_DURATION_MS;

const recentlyShown = new Map();

// Message currently occupying the singleton slot (null when empty/unknown).
// Lets callers dismiss their own transient toast without killing a newer
// alert that replaced it — same-id updates restart the 3s clock, so a
// greeting would otherwise linger through every post-login toast burst.
let activeMessage = null;

const pruneDedupeCache = (now) => {
    recentlyShown.forEach((timestamp, key) => {
        if (now - timestamp >= DEDUPE_WINDOW_MS) recentlyShown.delete(key);
    });
};

const shouldSuppress = (type, message, dedupeKey) => {
    const key = dedupeKey || (typeof message === 'string' ? `${type}:${message}` : '');
    if (!key) return false;

    const now = Date.now();
    pruneDedupeCache(now);
    const previousTimestamp = recentlyShown.get(key);
    if (previousTimestamp && now - previousTimestamp < DEDUPE_WINDOW_MS) return true;
    recentlyShown.set(key, now);
    return false;
};

const normalizeOptions = (options = {}) => {
    const rest = { ...options };
    delete rest.dedupeKey;
    delete rest.id;
    delete rest.duration;
    return {
        ...rest,
        id: APP_TOAST_ID,
        duration: APP_TOAST_DURATION_MS,
    };
};

const show = (type, message, options = {}) => {
    if (shouldSuppress(type, message, options.dedupeKey)) return APP_TOAST_ID;
    activeMessage = message;
    const normalized = normalizeOptions(options);
    if (type === 'default') return hotToast(message, normalized);
    if (typeof hotToast[type] !== 'function') return hotToast(message, normalized);
    return hotToast[type](message, normalized);
};

const appToast = (message, options) => show('default', message, options);

appToast.success = (message, options) => show('success', message, options);
appToast.error = (message, options) => show('error', message, options);
appToast.loading = (message, options = {}) => show('loading', message, options);
appToast.dismiss = () => hotToast.dismiss(APP_TOAST_ID);
appToast.remove = () => hotToast.remove(APP_TOAST_ID);

export const resetToastDedupeForTests = () => {
    recentlyShown.clear();
    activeMessage = null;
};

/**
 * Dismisses the slot only when it still shows `message`. A newer alert that
 * replaced it is left untouched to live out its own duration.
 */
export const dismissActiveToast = (message) => {
    if (activeMessage === message) {
        activeMessage = null;
        hotToast.dismiss(APP_TOAST_ID);
    }
};

export default appToast;
