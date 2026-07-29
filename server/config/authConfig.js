export const ACCESS_COOKIE_NAME = 'sibuyan_access';
export const REFRESH_COOKIE_NAME = 'sibuyan_refresh';
export const CSRF_COOKIE_NAME = 'sibuyan_csrf';

export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'sibuyan-alert-api';
export const JWT_AUDIENCE = 'sibuyan-alert-web';

const parseBoundedInteger = (value, fallback, minimum, maximum) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
        ? parsed
        : fallback;
};

export const getAccessTokenTtlMinutes = () => parseBoundedInteger(
    process.env.JWT_ACCESS_TTL_MINUTES,
    15,
    5,
    30
);

export const getSessionTtlDays = () => parseBoundedInteger(
    process.env.AUTH_SESSION_TTL_DAYS,
    7,
    1,
    30
);

const sharedCookieOptions = () => ({
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
});

export const getAccessCookieOptions = () => ({
    ...sharedCookieOptions(),
    httpOnly: true,
    path: '/',
    maxAge: getAccessTokenTtlMinutes() * 60 * 1000,
});

export const getRefreshCookieOptions = () => ({
    ...sharedCookieOptions(),
    httpOnly: true,
    path: '/api/auth',
    maxAge: getSessionTtlDays() * 24 * 60 * 60 * 1000,
});

export const getCsrfCookieOptions = () => ({
    ...sharedCookieOptions(),
    httpOnly: false,
    path: '/',
    maxAge: getSessionTtlDays() * 24 * 60 * 60 * 1000,
});

export const withoutCookieExpiry = ({ maxAge: _maxAge, ...options }) => options;

