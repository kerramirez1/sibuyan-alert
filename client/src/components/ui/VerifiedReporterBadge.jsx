import { HiOutlineBadgeCheck } from 'react-icons/hi';

const VerifiedReporterBadge = ({
    size = 'sm',
    variant = 'default',
    className = '',
    label = 'Verified reporter',
}) => {
    const isSm = size === 'sm';
    const isSidebar = variant === 'sidebar';

    // In the dark sidebar the badge tints green against the navy; on light
    // surfaces it uses the standard verified-green pairing.
    const baseClasses = isSidebar
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300';

    const sizeClasses = isSidebar
        // Icon-only in the sidebar: even padding, no text sizing or gap.
        ? 'p-1'
        : isSm
            ? 'px-1.5 py-0.5 text-[10px] gap-1'
            : 'px-2 py-0.5 text-xs gap-1.5';

    const iconClasses = isSm ? 'h-3 w-3' : 'h-3.5 w-3.5';

    return (
        <span
            role="status"
            aria-label={label}
            title={label}
            className={`inline-flex shrink-0 items-center rounded-md border font-semibold uppercase tracking-wider ${baseClasses} ${sizeClasses} ${className}`}
        >
            <HiOutlineBadgeCheck className={`${iconClasses} shrink-0`} aria-hidden="true" />
            {!isSidebar && <span>Verified</span>}
        </span>
    );
};

export default VerifiedReporterBadge;
