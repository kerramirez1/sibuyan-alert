import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import AuthSession from '../models/AuthSession.js';
import User from '../models/User.js';
import {
    ACCESS_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    getAccessCookieOptions,
    getAccessTokenTtlMinutes,
    getCsrfCookieOptions,
    getRefreshCookieOptions,
    getSessionTtlDays,
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    REFRESH_COOKIE_NAME,
    withoutCookieExpiry,
} from '../config/authConfig.js';

const MAX_ACTIVE_SESSIONS = 5;

export const hashSessionToken = (value) => crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');

export const getCookieValue = (cookieHeader, cookieName) => {
    if (!cookieHeader || typeof cookieHeader !== 'string') return null;

    const prefix = `${cookieName}=`;
    const cookie = cookieHeader
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(prefix));

    if (!cookie) return null;
    const rawValue = cookie.slice(prefix.length);

    try {
        return rawValue ? decodeURIComponent(rawValue) : null;
    } catch {
        return null;
    }
};

export const getRequestCookie = (req, cookieName) => getCookieValue(
    req.headers?.cookie,
    cookieName
);

const createOpaqueToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

const getRequestMetadata = (req) => ({
    userAgent: req.get?.('user-agent')?.slice(0, 512) || null,
    ipAddress: req.ip?.slice(0, 128) || null,
});

export const signAccessToken = ({ userId, sessionId }) => jwt.sign(
    { sid: sessionId.toString(), typ: 'access' },
    process.env.JWT_SECRET,
    {
        algorithm: JWT_ALGORITHM,
        audience: JWT_AUDIENCE,
        expiresIn: `${getAccessTokenTtlMinutes()}m`,
        issuer: JWT_ISSUER,
        subject: userId.toString(),
    }
);

export const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
});

export const setPrivateNoStore = (res) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
};

export const clearAuthCookies = (res) => {
    res.clearCookie(ACCESS_COOKIE_NAME, withoutCookieExpiry(getAccessCookieOptions()));
    res.clearCookie(REFRESH_COOKIE_NAME, withoutCookieExpiry(getRefreshCookieOptions()));
    res.clearCookie(CSRF_COOKIE_NAME, withoutCookieExpiry(getCsrfCookieOptions()));
    setPrivateNoStore(res);
};

const setSessionCookies = (res, { accessToken, refreshToken, csrfToken }) => {
    res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
    setPrivateNoStore(res);
};

const revokeExcessSessions = async (userId, currentSessionId) => {
    const excessSessions = await AuthSession.find({
        user: userId,
        _id: { $ne: currentSessionId },
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    })
        .sort({ createdAt: -1 })
        .skip(MAX_ACTIVE_SESSIONS - 1)
        .select('_id');

    if (excessSessions.length > 0) {
        await AuthSession.updateMany(
            { _id: { $in: excessSessions.map(({ _id }) => _id) } },
            { $set: { revokedAt: new Date(), revocationReason: 'session_limit' } }
        );
    }
};

export const issueSession = async ({ req, res, userId }) => {
    const refreshToken = createOpaqueToken();
    const csrfToken = createOpaqueToken(32);
    const expiresAt = new Date(Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000);

    const session = await AuthSession.create({
        user: userId,
        refreshTokenHash: hashSessionToken(refreshToken),
        csrfTokenHash: hashSessionToken(csrfToken),
        expiresAt,
        ...getRequestMetadata(req),
    });

    const accessToken = signAccessToken({ userId, sessionId: session._id });
    setSessionCookies(res, { accessToken, refreshToken, csrfToken });
    await revokeExcessSessions(userId, session._id);

    return session;
};

export const resolveAccessIdentity = async (token) => {
    const decoded = verifyAccessToken(token);
    if (decoded.typ !== 'access' || !decoded.sub || !decoded.sid) return null;

    const now = new Date();
    const [session, user] = await Promise.all([
        AuthSession.findOne({
            _id: decoded.sid,
            user: decoded.sub,
            revokedAt: null,
            expiresAt: { $gt: now },
        }),
        User.findById(decoded.sub),
    ]);

    if (!session || !user || user.role === 'admin') return null;
    return { decoded, session, user };
};

export const revokeAllUserSessions = async (userId, reason = 'logout_all') => AuthSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revocationReason: reason } }
);

export const revokeRequestSession = async (req) => {
    const refreshToken = getRequestCookie(req, REFRESH_COOKIE_NAME);
    if (!refreshToken) return null;

    return AuthSession.findOneAndUpdate(
        { refreshTokenHash: hashSessionToken(refreshToken), revokedAt: null },
        { $set: { revokedAt: new Date(), revocationReason: 'logout', lastUsedAt: new Date() } },
        { new: true }
    );
};

const safeTokenEquals = (left, right) => {
    if (!left || !right) return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const rotateSession = async ({ req, res }) => {
    const refreshToken = getRequestCookie(req, REFRESH_COOKIE_NAME);
    const csrfToken = getRequestCookie(req, CSRF_COOKIE_NAME);
    const csrfHeader = req.get('x-csrf-token');
    if (!refreshToken || !safeTokenEquals(csrfToken, csrfHeader)) return null;

    const refreshTokenHash = hashSessionToken(refreshToken);
    const existingSession = await AuthSession.findOne({ refreshTokenHash })
        .select('+csrfTokenHash');

    if (!existingSession) return null;

    if (existingSession.revokedAt) {
        const rotationAgeMs = Date.now() - existingSession.revokedAt.getTime();
        if (existingSession.revocationReason === 'rotated' && rotationAgeMs < 30_000) {
            return { status: 'rotation_in_progress' };
        }
        await revokeAllUserSessions(existingSession.user, 'security_replay');
        return null;
    }

    if (
        existingSession.expiresAt <= new Date()
        || !safeTokenEquals(existingSession.csrfTokenHash, hashSessionToken(csrfToken))
    ) {
        return null;
    }

    const claimedSession = await AuthSession.findOneAndUpdate(
        { _id: existingSession._id, revokedAt: null },
        { $set: { revokedAt: new Date(), revocationReason: 'rotated', lastUsedAt: new Date() } },
        { new: true }
    );

    if (!claimedSession) {
        await revokeAllUserSessions(existingSession.user, 'security_replay');
        return null;
    }

    const user = await User.findById(existingSession.user);
    if (!user || user.role === 'admin') return null;

    const replacement = await issueSession({ req, res, userId: user._id });
    await AuthSession.updateOne(
        { _id: existingSession._id },
        { $set: { replacedBy: replacement._id } }
    );

    return { status: 'rotated', user };
};
