/**
 * The avatar upload contract, in one place.
 *
 * These values mirror the server (`server/middleware/upload.js`: the
 * `uploadAvatar` multer limits and the image MIME allowlist). The picker's
 * `accept` attribute used to advertise `image/jpg` while the server allowlist
 * did not, so a browser that reports that non-standard type was offered a file
 * it could never upload.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_LABEL = `${Math.round(AVATAR_MAX_BYTES / (1024 * 1024))}MB`;

// `image/jpg` is what several browsers report for a `.jpg` file even though it
// is not a registered type. The server normalizes it to `image/jpeg`, so the
// picker may offer it.
export const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const AVATAR_ACCEPT_ATTRIBUTE = 'image/png,image/jpeg,image/jpg,image/webp';

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

/**
 * Why a chosen photo cannot be used, or null when it is acceptable.
 *
 * Returning a message instead of throwing keeps the caller a straight-line
 * handler: it can toast the reason and stop, with no rejected-promise path for
 * what is ordinary user input.
 */
export const describeAvatarRejection = (file) => {
    if (!file) return 'Choose a photo first.';

    const type = String(file.type || '').toLowerCase();

    // iOS hands the picker a HEIC unless the user changed the camera setting.
    // The server cannot decode it, so say so here rather than after a round
    // trip that answers with the generic "must be JPEG, PNG, or WebP".
    if (HEIC_MIME_TYPES.has(type)) {
        return 'HEIC photos are not supported yet. Take a new photo with the camera, or export the photo as JPEG first.';
    }

    // An empty type means the browser withheld it; let the server's magic-number
    // check make the call rather than rejecting a real photo here.
    if (type && !AVATAR_ALLOWED_MIME_TYPES.includes(type)) {
        return 'Photos must be JPEG, PNG, or WebP images.';
    }

    if (file.size > AVATAR_MAX_BYTES) {
        return `Image must be less than ${AVATAR_MAX_LABEL}`;
    }

    return null;
};

export default {
    AVATAR_MAX_BYTES,
    AVATAR_MAX_LABEL,
    AVATAR_ALLOWED_MIME_TYPES,
    AVATAR_ACCEPT_ATTRIBUTE,
    describeAvatarRejection,
};
