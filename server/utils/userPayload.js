/** Verification fields for the account owner or its authorized municipal reviewer.
 * Keep documents, reviewer identity and verification history out of this projection.
 */
export const buildUserVerificationPayload = (user) => ({
    role: user.role,
    isVerified: user.isVerified === true,
    verificationStatus: user.verificationStatus ?? null,
    verificationFeedback: user.verificationFeedback ?? null,
});

/**
 * The single shape of "my own account" returned to the signed-in client.
 *
 * Registration, login, GET/PUT /auth/me and ID resubmission share this payload.
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
        ...buildUserVerificationPayload(user),
        agency: user.agency,
        responderUnit: user.responderUnit,
        assignedMunicipality: user.assignedMunicipality,
        avatar: user.avatar,
        address: user.address,
        barangay: user.barangay,
        notificationPreferences: user.notificationPreferences,
        createdAt: user.createdAt,
    };
};

export default buildSelfUserPayload;
