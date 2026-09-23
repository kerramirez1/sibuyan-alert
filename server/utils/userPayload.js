/**
 * The single shape of "my own account" returned to the signed-in client.
 *
 * `/auth/login`, `GET /auth/me` and `PUT /auth/me` all answer with this payload.
 * They used to be written out by hand in each handler, and they drifted: the
 * profile update omitted `isVerified`/`verificationStatus`, so a verified
 * reporter who saved a new display name lost the client-side verification state
 * that gates `/report` and the submit CTA until the next `/auth/me` poll
 * repaired it. One builder is what makes that impossible rather than unlikely.
 *
 * `id` (not `_id`) is the identifier every client call site reads.
 */
export const buildSelfUserPayload = (user) => {
    if (!user) return null;

    return {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        agency: user.agency,
        responderUnit: user.responderUnit,
        assignedMunicipality: user.assignedMunicipality,
        avatar: user.avatar,
        address: user.address,
        barangay: user.barangay,
        isVerified: user.isVerified,
        verificationStatus: user.verificationStatus,
        notificationPreferences: user.notificationPreferences,
        createdAt: user.createdAt,
    };
};

export default buildSelfUserPayload;
