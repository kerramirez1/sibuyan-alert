/**
 * Recipient-facing URL validation for emailed links (responder invitations,
 * password resets).
 *
 * An emailed link is only usable when it carries an absolute HTTP(S) origin the
 * recipient's browser can reach. Two misconfigurations have produced dead
 * invitations in the past, and both pass every other check in the system:
 *
 * 1. CLIENT_URL unset or relative — the email then carries a bare
 *    `/reset-password/<token>` path with no host. SMTP still accepts the
 *    message, so the send is reported as delivered while the link can never
 *    resolve anywhere.
 * 2. CLIENT_URL left on the development default (`http://localhost:5173`) in a
 *    deployed environment. It is an absolute HTTP URL, so the production boot
 *    validator accepts it — but no recipient's browser can open it.
 *
 * Everything here is pure and secret-free: it inspects configuration, never
 * tokens, and its error strings are safe to show to a municipal administrator.
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

export const getConfiguredClientBaseUrl = (env = process.env) =>
    (env.CLIENT_URL || '').trim().replace(/\/+$/, '');

export const isAbsoluteHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

export const isLocalClientUrl = (value) => {
    try {
        // WHATWG URLs keep IPv6 brackets on `hostname` (`[::1]`), so strip
        // them before comparing.
        const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
        return LOCAL_HOSTNAMES.has(hostname);
    } catch {
        return false;
    }
};

/**
 * Resolve the base URL recipient-facing links are built from.
 *
 * `localhost` is legitimate for local development, so it is only rejected
 * when the process presents itself as a shared environment (`NODE_ENV ===
 * 'production'` — the same signal the boot validator uses). Anything that is
 * not an absolute HTTP(S) URL is rejected everywhere: a relative emailed link
 * is unusable in every environment.
 *
 * Returns `{ url, code, error }` — never throws, never contains secrets.
 */
export const resolveRecipientClientUrl = (env = process.env) => {
    const base = getConfiguredClientBaseUrl(env);

    if (!base || !isAbsoluteHttpUrl(base)) {
        return {
            url: null,
            code: 'CLIENT_URL_MISSING',
            error: 'CLIENT_URL is not set to an absolute HTTP(S) client address',
        };
    }

    if (env.NODE_ENV === 'production' && isLocalClientUrl(base)) {
        return {
            url: null,
            code: 'CLIENT_URL_LOCAL_IN_PRODUCTION',
            error: 'CLIENT_URL points to localhost, which recipients cannot open',
        };
    }

    return { url: base, code: null, error: null };
};

/**
 * Join a validated base with an absolute client path such as
 * `/reset-password/<token>`. Returns the same `{ url, code, error }` shape so
 * callers can treat a bad base exactly like a delivery failure.
 */
export const buildRecipientUrl = (path, env = process.env) => {
    const resolved = resolveRecipientClientUrl(env);
    if (!resolved.url) return resolved;
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return { url: `${resolved.url}${suffix}`, code: null, error: null };
};
