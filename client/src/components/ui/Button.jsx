import { forwardRef } from 'react';

const BASE_STYLES = [
    'ui-button relative inline-flex min-w-0 items-center justify-center gap-2 rounded-xl border border-transparent font-semibold',
    'text-center leading-tight transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
].join(' ');

const VARIANT_STYLES = Object.freeze({
    primary: 'border-transparent bg-brand-700 text-white hover:bg-brand-800',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-500',
    dangerOutline: 'bg-gray-100 text-red-700 hover:bg-red-50 focus-visible:ring-red-500',
    success: 'border-transparent bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-500',
    warning: 'bg-amber-700 text-white hover:bg-amber-800 focus-visible:ring-amber-500',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-950',
    outline: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
});

const SIZE_STYLES = Object.freeze({
    sm: 'min-h-9 px-3 py-1.5 text-xs',
    md: 'min-h-11 px-4 py-2.5 text-sm',
    lg: 'min-h-12 px-5 py-3 text-sm',
    xl: 'min-h-[3.25rem] px-6 py-3.5 text-base',
    iconSm: 'h-9 w-9 shrink-0 p-0 text-sm',
    icon: 'h-11 w-11 shrink-0 p-0 text-sm',
    iconLg: 'h-12 w-12 shrink-0 p-0 text-base',
});

const joinClassNames = (...values) => values.filter(Boolean).join(' ');

export const buttonClassNames = ({
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className = '',
} = {}) => joinClassNames(
    BASE_STYLES,
    VARIANT_STYLES[variant] || VARIANT_STYLES.primary,
    SIZE_STYLES[size] || SIZE_STYLES.md,
    fullWidth && 'w-full',
    className,
);

const LoadingSpinner = () => (
    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
);

const Button = forwardRef(({
    as: Component = 'button',
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Please wait...',
    disabled = false,
    fullWidth = false,
    icon: Icon,
    iconPosition = 'left',
    className = '',
    type,
    onClick,
    ...props
}, ref) => {
    const isNativeButton = Component === 'button';
    const isDisabled = disabled || loading;

    const handleClick = (event) => {
        if (isDisabled && !isNativeButton) {
            event.preventDefault();
            return;
        }
        onClick?.(event);
    };

    return (
        <Component
            ref={ref}
            type={isNativeButton ? (type || 'button') : undefined}
            className={buttonClassNames({ variant, size, fullWidth, className })}
            disabled={isNativeButton ? isDisabled : undefined}
            aria-disabled={!isNativeButton && isDisabled ? true : undefined}
            aria-busy={loading || undefined}
            onClick={handleClick}
            {...props}
        >
            {loading ? (
                <>
                    <LoadingSpinner />
                    <span>{loadingLabel}</span>
                </>
            ) : (
                <>
                    {Icon && iconPosition === 'left' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {children}
                    {Icon && iconPosition === 'right' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </>
            )}
        </Component>
    );
});

Button.displayName = 'Button';

export default Button;
