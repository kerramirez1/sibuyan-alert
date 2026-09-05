const normalizeValue = (value) => typeof value === 'string' ? value.trim() : '';

/**
 * Resolves the Socket.IO origin without coupling a production build to a
 * specific deployment hostname. Explicit configuration remains available for
 * split client/server deployments, while a combined deployment uses the page
 * origin automatically.
 */
export const resolveSocketOrigin = ({ socketUrl, apiUrl, browserOrigin } = {}) => {
    const explicitSocketUrl = normalizeValue(socketUrl);
    const normalizedBrowserOrigin = normalizeValue(browserOrigin);
    // A localhost URL baked into a production build (e.g. VITE_SOCKET_URL from
    // dev .env) must never override the real page origin — that kills realtime.
    if (explicitSocketUrl) {
        try {
            const parsed = new URL(explicitSocketUrl, normalizedBrowserOrigin || undefined);
            const isLocalhostTarget = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(parsed.hostname);
            const isProdPage = normalizedBrowserOrigin && !/^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\]))/i.test(normalizedBrowserOrigin);
            if (isLocalhostTarget && isProdPage) {
                return normalizedBrowserOrigin.replace(/\/$/, '');
            }
        } catch {
            // Fall through to normal resolution below.
        }
        return explicitSocketUrl.replace(/\/$/, '');
    }
    const normalizedApiUrl = normalizeValue(apiUrl);

    if (normalizedApiUrl) {
        try {
            return new URL(normalizedApiUrl, normalizedBrowserOrigin || undefined).origin;
        } catch {
            // An invalid optional API URL must not force the browser to connect
            // to localhost. Fall back to the current page origin instead.
        }
    }

    return normalizedBrowserOrigin || undefined;
};

export default resolveSocketOrigin;
