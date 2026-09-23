import { describe, expect, test } from 'vitest';
import {
    AVATAR_ACCEPT_ATTRIBUTE,
    AVATAR_MAX_BYTES,
    AVATAR_MAX_LABEL,
    describeAvatarRejection,
} from '../config/avatarUpload';

const file = (overrides = {}) => ({
    name: 'photo.jpg',
    size: 1024,
    type: 'image/jpeg',
    ...overrides,
});

describe('avatar upload contract', () => {
    test('accepts every type the server allowlist accepts', () => {
        for (const type of ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']) {
            expect(describeAvatarRejection(file({ type }))).toBeNull();
        }
    });

    test('the picker advertises an accepted type for every file it offers', () => {
        const advertised = AVATAR_ACCEPT_ATTRIBUTE.split(',').map((value) => value.trim());

        // The picker used to advertise `image/jpg` while the server allowlist did
        // not, which is a photo the user can choose and never upload.
        expect(advertised).toEqual(
            expect.arrayContaining(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
        );
        for (const type of advertised) {
            expect(describeAvatarRejection(file({ type }))).toBeNull();
        }
    });

    test('explains a HEIC photo instead of failing it at the server', () => {
        expect(describeAvatarRejection(file({ type: 'image/heic' }))).toMatch(/HEIC/);
        expect(describeAvatarRejection(file({ type: 'image/heif' }))).toMatch(/HEIC/);
    });

    test('rejects an unsupported type with the accepted list', () => {
        expect(describeAvatarRejection(file({ type: 'image/gif' }))).toMatch(/JPEG, PNG, or WebP/);
    });

    test('rejects a photo over the size limit with the limit in the message', () => {
        expect(describeAvatarRejection(file({ size: AVATAR_MAX_BYTES + 1 })))
            .toBe(`Image must be less than ${AVATAR_MAX_LABEL}`);
        expect(describeAvatarRejection(file({ size: AVATAR_MAX_BYTES }))).toBeNull();
    });

    test('lets the server judge a file whose type the browser withheld', () => {
        expect(describeAvatarRejection(file({ type: '' }))).toBeNull();
    });

    test('asks for a photo when nothing was chosen', () => {
        expect(describeAvatarRejection(null)).toMatch(/Choose a photo/);
    });
});
