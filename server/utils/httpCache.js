/**
 * Conditional GET support for JSON endpoints.
 *
 * Why this exists: files and evidence previews already send ETags, but every
 * JSON endpoint re-sent its full body on every request. The public incident
 * list is large (addresses, descriptions, evidence metadata) and changes
 * rarely, so a client refreshing it re-downloaded the same bytes. On a weak
 * link that is the difference between a 200 KB transfer and a ~200 byte
 * `304 Not Modified`.
 *
 * Two ways to derive the validator:
 *
 * - **From a version stamp** (preferred): a cheap fingerprint such as
 *   "newest updatedAt + document count". This costs one indexed query instead
 *   of serialising the whole payload.
 * - **From the payload itself**: used when no cheap stamp exists. Correct but
 *   it means the body is already built, so it only saves the transfer, not the
 *   query work.
 */
import { createHash } from 'node:crypto';

/** Builds a weak validator. Weak because it identifies the payload, not bytes. */
export const buildWeakEtag = (...parts) => {
    const hash = createHash('sha1');
    hash.update(parts.map((part) => String(part ?? '')).join('|'));
    return `W/"${hash.digest('hex').slice(0, 32)}"`;
};

const normalizeTag = (value) => String(value).trim().replace(/^W\//, '');

/**
 * RFC 7232 If-None-Match comparison.
 * Handles the `*` wildcard and comma-separated candidate lists.
 */
export const etagMatches = (ifNoneMatch, etag) => {
    if (!ifNoneMatch) return false;

    const header = String(ifNoneMatch).trim();
    if (header === '*') return true;

    const target = normalizeTag(etag);
    return header
        .split(',')
        .map((candidate) => normalizeTag(candidate))
        .some((candidate) => candidate === target);
};

/**
 * Sends a JSON payload with an ETag, honouring If-None-Match.
 *
 * `Vary` is set on both Cookie and Accept-Encoding:
 * - Cookie, because an authenticated response must never be served to a
 *   different session by a shared cache.
 * - Accept-Encoding, because compression changes the representation.
 *
 * @returns {boolean} true when a 304 was sent and no body was written
 */
export const sendConditionalJson = (
    req,
    res,
    payload,
    { etag, maxAgeSeconds = 0, private: isPrivate = false, status = 200 } = {}
) => {
    const resolvedEtag = etag || buildWeakEtag(JSON.stringify(payload));
    const visibility = isPrivate ? 'private' : 'public';

    res.setHeader('ETag', resolvedEtag);
    res.setHeader('Cache-Control', `${visibility}, max-age=${maxAgeSeconds}, must-revalidate`);
    res.setHeader('Vary', 'Cookie, Accept-Encoding');

    if (etagMatches(req.headers['if-none-match'], resolvedEtag)) {
        // 304 must not carry a body, and must repeat the validator so the
        // client can keep using it.
        res.status(304).end();
        return true;
    }

    res.status(status).json(payload);
    return false;
};

export default { buildWeakEtag, etagMatches, sendConditionalJson };
