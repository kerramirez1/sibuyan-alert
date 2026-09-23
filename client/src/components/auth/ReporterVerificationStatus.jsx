import { HiOutlineBadgeCheck, HiOutlineClock, HiOutlineExclamationCircle, HiOutlineInformationCircle } from 'react-icons/hi';
import { getReporterVerificationPresentation } from '../../utils/reporterVerification';

const TONES = {
    warning: { icon: HiOutlineClock, className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200' },
    success: { icon: HiOutlineBadgeCheck, className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' },
    danger: { icon: HiOutlineExclamationCircle, className: 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200' },
    neutral: { icon: HiOutlineInformationCircle, className: 'bg-[var(--surface-hover)] text-[var(--text-secondary)]' },
};

const ReporterVerificationStatus = ({ user, children }) => {
    const status = getReporterVerificationPresentation(user);
    if (!status) return null;
    const { icon: Icon, className } = TONES[status.tone];
    const feedback = typeof user.verificationFeedback === 'string' ? user.verificationFeedback.trim() : '';

    return (
        <div className="min-w-0" role="group" aria-label="Reporter verification">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Verification status</p>
            <p role="status" aria-label="Verification status" aria-live="polite" aria-atomic="true" className={`inline-flex max-w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold leading-relaxed ${className}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{status.label}</span>
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{status.description}</p>
            {status.key === 'rejected' && feedback && (
                <div className="mt-3 border-l-2 border-red-300 pl-3 dark:border-red-800">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Administrator feedback</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-secondary)]">{feedback}</p>
                </div>
            )}
            {children}
        </div>
    );
};

export default ReporterVerificationStatus;
