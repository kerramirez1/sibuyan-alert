import { forwardRef, useId } from 'react';

const Input = forwardRef(({
    label,
    error,
    icon: Icon,
    rightElement = null,
    className = '',
    id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
    ...props
}, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const descriptionIds = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;
    return (
        <div className={className}>
            {label && (
                <label htmlFor={inputId} className="label">{label}</label>
            )}
            <div className="relative">
                {Icon && (
                    <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={invalid ?? (error ? true : undefined)}
                    aria-describedby={descriptionIds}
                    className={`input ${Icon ? 'pl-10' : ''} ${rightElement ? 'pr-12' : ''} ${error ? 'input-error' : ''}`}
                    {...props}
                />
                {rightElement && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                        {rightElement}
                    </div>
                )}
            </div>
            {error && (
                <p id={errorId} className="mt-1.5 text-xs leading-relaxed text-[var(--danger)]">{error}</p>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
