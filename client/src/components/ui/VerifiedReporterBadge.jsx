import { HiOutlineBadgeCheck } from 'react-icons/hi';

const VerifiedReporterBadge = ({
    size = 'sm',
    variant = 'default',
    className = '',
    label = 'Verified reporter',
}) => {
    const isSm = size === 'sm';
    const isSidebar = variant === 'sidebar';

    const baseClasses = isSidebar
        ? 'border-white/15 bg-white/[0.08] text-sky-300'
        : 'border-brand-200 bg-brand-50 text-brand-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-sky-300';

    const sizeClasses = isSm
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
            <span>Verified</span>
        </span>
    );
};

export default VerifiedReporterBadge;
