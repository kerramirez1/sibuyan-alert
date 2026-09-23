/**
 * Base Skeleton component
 * Neutral color tokens for light & dark themes, respects prefers-reduced-motion,
 * includes accessibility attributes (role="status", aria-busy="true").
 */
export const Skeleton = ({
    className = '',
    variant = 'rectangular', // 'text' | 'circular' | 'rectangular' | 'rounded' | 'card' | 'button'
    width,
    height,
    as: Component = 'div',
    animate = true,
    label,
    children,
    role = 'status',
    ...props
}) => {
    const variantClasses = {
        text: 'h-4 w-full rounded',
        circular: 'rounded-full shrink-0',
        rectangular: 'rounded-none',
        rounded: 'rounded-xl',
        card: 'surface-panel',
        button: 'h-10 rounded-lg',
    }[variant] || 'rounded-xl';

    const baseColorClass = variant === 'card'
        ? ''
        : 'bg-gray-200/80 dark:bg-white/[0.08]';

    const animationClass = animate
        ? 'motion-safe:animate-pulse motion-reduce:animate-none'
        : '';

    const style = {
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...props.style,
    };

    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <Component
            {...roleAttr}
            className={`${baseColorClass} ${variantClasses} ${animationClass} ${className}`.trim()}
            style={style}
            {...props}
        >
            {label && <span className="sr-only">{label}</span>}
            {children}
        </Component>
    );
};

/**
 * SkeletonText: Lines of text with natural last-line width variation.
 */
export const SkeletonText = ({
    lines = 1,
    lastLineWidth = '70%',
    lineHeight = 'h-3.5',
    className = '',
    gap = 'space-y-2',
    role = 'status',
    label,
    ...props
}) => {
    if (lines === 1) {
        return (
            <Skeleton
                variant="text"
                role={role}
                label={label}
                className={`${lineHeight} ${className}`}
                {...props}
            />
        );
    }

    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <div className={gap} {...roleAttr}>
            {label && <span className="sr-only">{label}</span>}
            {Array.from({ length: lines }).map((_, index) => {
                const isLast = index === lines - 1;
                const widthStyle = isLast ? { width: lastLineWidth } : {};
                return (
                    <Skeleton
                        key={index}
                        variant="text"
                        role={null}
                        className={`${lineHeight} ${className}`}
                        style={widthStyle}
                        animate={props.animate}
                    />
                );
            })}
        </div>
    );
};

/**
 * SkeletonCircle: Circular avatar/icon placeholder
 */
export const SkeletonCircle = ({
    size = 'h-9 w-9',
    className = '',
    role = 'status',
    ...props
}) => (
    <Skeleton
        variant="circular"
        role={role}
        className={`${size} ${className}`}
        {...props}
    />
);

/**
 * SkeletonButton: Rounded or pill button placeholder
 */
export const SkeletonButton = ({
    size = 'h-9 w-24',
    className = '',
    role = 'status',
    ...props
}) => (
    <Skeleton
        variant="button"
        role={role}
        className={`${size} ${className}`}
        {...props}
    />
);

/**
 * SkeletonCard: Styled card container matching application design system
 */
export const SkeletonCard = ({
    className = '',
    children,
    padding = 'p-4 sm:p-5',
    role = 'status',
    label,
    ...props
}) => {
    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <div
            {...roleAttr}
            className={`surface-panel ${padding} ${className}`.trim()}
            {...props}
        >
            {label && <span className="sr-only">{label}</span>}
            {children}
        </div>
    );
};

/**
 * SkeletonRow: A single structured row for lists and tables
 */
export const SkeletonRow = ({
    className = '',
    hasAvatar = false,
    avatarSize = 'h-9 w-9',
    lines = 2,
    trailingAction = false,
    role = 'status',
    label,
    ...props
}) => {
    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <div
            {...roleAttr}
            className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 ${className}`.trim()}
            {...props}
        >
            {label && <span className="sr-only">{label}</span>}
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {hasAvatar && <SkeletonCircle size={avatarSize} role={null} />}
                <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton variant="text" role={null} className="h-3.5 w-2/5 rounded" />
                    {lines > 1 && <Skeleton variant="text" role={null} className="h-2.5 w-3/5 rounded opacity-80" />}
                </div>
            </div>
            {trailingAction && <Skeleton variant="button" role={null} className="h-7 w-16 shrink-0 rounded-lg" />}
        </div>
    );
};

/**
 * SkeletonTable: Full table skeleton with header and data rows
 */
export const SkeletonTable = ({
    columns = 5,
    rows = 5,
    className = '',
    role = 'status',
    label = 'Loading table data',
    ...props
}) => {
    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <div
            {...roleAttr}
            className={`overflow-x-auto ${className}`.trim()}
            {...props}
        >
            <span className="sr-only">{label}</span>
            <table className="w-full text-left text-xs border-collapse">
                <thead>
                    <tr className="border-b border-gray-200/80 bg-gray-50/50 dark:border-white/10 dark:bg-white/[0.01]">
                        {Array.from({ length: columns }).map((_, i) => (
                            <th key={i} className="py-3 px-3 sm:px-4">
                                <Skeleton variant="text" role={null} className="h-3 w-16" />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {Array.from({ length: rows }).map((_, r) => (
                        <tr key={r}>
                            {Array.from({ length: columns }).map((_, c) => (
                                <td key={c} className="py-3.5 px-3 sm:px-4">
                                    <Skeleton
                                        variant="text"
                                        role={null}
                                        className={`h-3.5 ${c === 0 ? 'w-28' : c === columns - 1 ? 'w-12 ml-auto' : 'w-20'}`}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/**
 * SkeletonThumbnail: Aspect-ratio image placeholder
 */
export const SkeletonThumbnail = ({
    aspectRatio = 'aspect-square',
    className = '',
    sizeClasses = '',
    role = 'status',
    ...props
}) => (
    <Skeleton
        variant="rounded"
        role={role}
        className={`${aspectRatio} ${sizeClasses} ${className}`}
        {...props}
    />
);

/**
 * PageSkeleton: Standard canonical full-page placeholder
 */
export const PageSkeleton = ({
    label = 'Loading page content',
    showMetrics = true,
    metricCount = 4,
    showTable = false,
    className = '',
    role = 'status',
}) => {
    const roleAttr = role ? { role, 'aria-busy': 'true' } : {};
    if (label && role) {
        roleAttr['aria-label'] = label;
    }

    return (
        <div
            {...roleAttr}
            className={`mx-auto w-full max-w-6xl space-y-4 sm:space-y-6 ${className}`.trim()}
        >
            <span className="sr-only">{label}</span>

            {/* Header Skeleton */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2 min-w-0 flex-1">
                    <Skeleton variant="text" role={null} className="h-4 w-28 rounded-md" />
                    <Skeleton variant="text" role={null} className="h-7 w-56 sm:w-72 rounded-lg" />
                    <Skeleton variant="text" role={null} className="h-3.5 w-72 sm:w-96 rounded-md opacity-80" />
                </div>
                <div className="flex gap-2 shrink-0">
                    <SkeletonButton role={null} className="h-9 w-28" />
                </div>
            </div>

            {/* 4-Metric Strip Skeleton */}
            {showMetrics && (
                <div className="grid grid-cols-2 divide-y divide-gray-200/80 overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/70 shadow-2xs dark:divide-white/10 dark:border-white/10 dark:bg-[#0c1813]/70 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:rounded-2xl">
                    {Array.from({ length: metricCount }).map((_, i) => (
                        <div key={i} className="p-3 sm:p-4 min-h-[88px] sm:min-h-[104px] flex flex-col justify-between bg-white dark:bg-[#0c1813]/90">
                            <Skeleton variant="text" role={null} className="h-3 w-20 rounded" />
                            <Skeleton variant="text" role={null} className="h-7 w-12 rounded mt-1" />
                            <Skeleton variant="text" role={null} className="h-2.5 w-24 rounded mt-1 opacity-70" />
                        </div>
                    ))}
                </div>
            )}

            {/* Main Body Skeleton */}
            {showTable ? (
                <SkeletonCard role={null} padding="p-0" className="overflow-hidden">
                    <SkeletonTable role={null} rows={5} columns={5} />
                </SkeletonCard>
            ) : (
                <div className="space-y-3 sm:space-y-4">
                    <SkeletonCard role={null} className="h-56 sm:h-64 flex flex-col justify-between">
                        <div className="space-y-3">
                            <Skeleton variant="text" role={null} className="h-4 w-40" />
                            <Skeleton variant="text" role={null} className="h-3.5 w-full" />
                            <Skeleton variant="text" role={null} className="h-3.5 w-4/5" />
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-white/5">
                            <Skeleton variant="text" role={null} className="h-3 w-24" />
                            <Skeleton variant="button" role={null} className="h-7 w-20" />
                        </div>
                    </SkeletonCard>
                    <SkeletonCard role={null} className="h-40 sm:h-48" />
                </div>
            )}
        </div>
    );
};

export default Skeleton;
