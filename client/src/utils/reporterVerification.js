const UNAVAILABLE = {
    key: 'unavailable',
    label: 'Status unavailable',
    description: 'Your approval status could not be confirmed. Contact your municipal administrator.',
    tone: 'neutral',
};

const STATUSES = {
    pending: {
        key: 'pending',
        label: 'Pending administrator approval',
        description: 'Your ID and selfie are waiting for municipal administrator review.',
        tone: 'warning',
    },
    approved: {
        key: 'approved',
        label: 'Verified reporter',
        description: 'You can submit incident reports.',
        tone: 'success',
    },
    rejected: {
        key: 'rejected',
        label: 'Verification rejected',
        description: 'Review the administrator feedback and resubmit your ID if available.',
        tone: 'danger',
    },
    not_required: {
        key: 'not_required',
        label: 'Not required',
        description: 'The server marks verification as not required.',
        tone: 'neutral',
    },
};

/** Presentation only: role identity never implies approval or replaces API authorization. */
export const getReporterVerificationPresentation = (user) => {
    if (user?.role !== 'reporter') return null;
    const approved = user.verificationStatus === 'approved' && user.isVerified === true;
    const knownStatus = typeof user.verificationStatus === 'string' && Object.hasOwn(STATUSES, user.verificationStatus)
        ? STATUSES[user.verificationStatus]
        : UNAVAILABLE;
    const presentation = user.verificationStatus === 'approved' && !approved ? UNAVAILABLE : knownStatus;
    return {
        ...presentation,
        approved,
        canResubmit: user.verificationStatus === 'rejected' && user.isVerified === false,
    };
};

/**
 * Returns true only when the user is explicitly a reporter role whose
 * verificationStatus is 'approved' and isVerified is true.
 */
export const isVerifiedReporter = (user) => {
    if (!user || typeof user !== 'object') return false;
    return Boolean(
        user.role === 'reporter' &&
        user.verificationStatus === 'approved' &&
        user.isVerified === true
    );
};

/**
 * Returns true when an incident report's reporter is verified.
 * Guarantees that if role or verificationStatus are present on the reporter
 * projection or payload, non-reporter roles and non-approved statuses are excluded.
 */
export const isVerifiedReportReporter = (reporter) => {
    if (!reporter || typeof reporter !== 'object') return false;
    if (reporter.isVerified !== true) return false;
    if (reporter.role && reporter.role !== 'reporter') return false;
    if (reporter.verificationStatus && reporter.verificationStatus !== 'approved') return false;
    return true;
};

