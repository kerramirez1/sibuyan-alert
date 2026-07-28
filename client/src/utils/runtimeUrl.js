const normalizeValue = (value) => typeof value === 'string' ? value.trim() : '';

/**
 * Resolves the Socket.IO origin without coupling a production build to a
 * specific deployment hostname. Explicit configuration remains available for
 * split client/server deployments, while a combined deployment uses the page
 * origin automatically.
 */
export const resolveSocketOrigin = ({ socketUrl, apiUrl, browserOrigin } = {}) => {
    const explicitSocketUrl = normalizeValue(socketUrl);
    if (explicitSocketUrl) return explicitSocketUrl.replace(/\/$/, '');

    const normalizedBrowserOrigin = normalizeValue(browserOrigin);
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
